-- Terminal windows: the plain shell and nvim-dap's integrated terminal.
--
-- Both open in a split below the code, both survive being hidden, and neither
-- is ever anchored on a side panel. Callers get five verbs; which window shows
-- which buffer, where a split may be anchored, and what height to restore stay
-- in here.

local M = {}

local HEIGHT = 15

-- Height a terminal had before it was maximized, keyed by buffer. Absent means
-- the terminal is not maximized.
local unmaximized = {}

---@param buf integer?
---@return integer? window
local function window_for(buf)
  if not (buf and vim.api.nvim_buf_is_valid(buf)) then return nil end
  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    if vim.api.nvim_win_get_buf(win) == buf then return win end
  end
  return nil
end

-- Splitting from the focused window puts the terminal inside whatever holds
-- focus, and during a debug session that is usually dap-view, neo-tree, or the
-- terminal itself. Anchoring on a window that holds a file keeps the panels
-- full height and the terminal under the code, where both VS Code and the
-- previous layout put it. Falls back to the focused window so the caller
-- always gets a split rather than an error.
---@return integer window
local function code_window()
  local current = vim.api.nvim_get_current_win()
  if vim.bo[vim.api.nvim_win_get_buf(current)].buftype == '' then return current end
  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    if vim.bo[vim.api.nvim_win_get_buf(win)].buftype == '' then return win end
  end
  return current
end

---@param buf integer
---@param enter boolean
---@return integer window
local function open_below(buf, enter)
  local win = vim.api.nvim_open_win(buf, enter, { split = 'below', win = code_window(), height = HEIGHT })
  local wo = vim.wo[win][0]
  wo.number = false
  wo.relativenumber = false
  wo.signcolumn = 'no'
  -- The split inherits the code window's treesitter foldexpr, which would then
  -- run per line on every terminal redraw against a buffer with no parser.
  wo.foldmethod = 'manual'
  unmaximized[buf] = nil
  return win
end

-- Floating windows (which-key, completion docs, fidget) count in the tabpage
-- list but cannot take over as the last window, so only splits are counted.
---@return integer
local function split_window_count()
  local count = 0
  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    if vim.api.nvim_win_get_config(win).relative == '' then count = count + 1 end
  end
  return count
end

---@param win integer
local function hide(win)
  if split_window_count() == 1 then
    vim.notify('The terminal is the only window', vim.log.levels.WARN)
    return
  end
  vim.api.nvim_win_hide(win)
end

local shell_buf

---@return integer buffer
local function shell_terminal()
  if shell_buf and vim.api.nvim_buf_is_valid(shell_buf) then return shell_buf end
  local buf = vim.api.nvim_create_buf(false, false)
  shell_buf = buf
  vim.api.nvim_buf_call(buf, function()
    vim.fn.jobstart(vim.o.shell, {
      term = true,
      on_exit = function()
        vim.schedule(function()
          if vim.api.nvim_buf_is_valid(buf) then vim.api.nvim_buf_delete(buf, { force = true }) end
          unmaximized[buf] = nil
          if shell_buf == buf then shell_buf = nil end
        end)
      end,
    })
  end)
  return buf
end

-- Found by nvim-dap's own `dap-type` buffer variable rather than through a
-- session. `term_buf` lives only on the session that spawned the terminal, and
-- with autoAttachChildProcesses the focused session is the attached child
-- exactly while stopped on a breakpoint, so `dap.session().term_buf` is nil
-- when the terminal matters most (measured: the child is not in dap.sessions()
-- either). The buffer outlives every session anyway, since nvim-dap pools
-- terminal buffers, and that is what keeps the output readable after a
-- terminate.
---@return integer? buffer
local function dap_terminal()
  local newest
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    if vim.b[buf]['dap-type'] and vim.bo[buf].buftype == 'terminal' then newest = buf end
  end
  return newest
end

--- Show or hide the plain shell, keeping its scrollback across both.
function M.toggle_shell()
  local win = window_for(shell_buf)
  if win then return hide(win) end
  open_below(shell_terminal(), true)
  vim.cmd.startinsert()
end

--- Show or hide nvim-dap's integrated terminal.
function M.toggle_debug()
  local buf = dap_terminal()
  if not buf then
    vim.notify('No debug terminal: start a session first', vim.log.levels.WARN)
    return
  end
  local win = window_for(buf)
  if win then return hide(win) end
  open_below(buf, true)
  vim.cmd.startinsert()
end

--- Fill the column with the terminal, or restore the height it had before.
--- Acts on the focused terminal, else the debug terminal, else the shell.
function M.toggle_maximize()
  local buf = vim.api.nvim_get_current_buf()
  local win = vim.bo[buf].buftype == 'terminal' and vim.api.nvim_get_current_win() or nil
  if not win then
    buf = dap_terminal()
    win = window_for(buf)
  end
  if not win then
    buf = shell_buf
    win = window_for(buf)
  end
  if not win then
    vim.notify('No terminal is showing', vim.log.levels.WARN)
    return
  end
  local previous = unmaximized[buf]
  if previous then
    vim.api.nvim_win_set_height(win, previous)
    unmaximized[buf] = nil
    return
  end
  unmaximized[buf] = vim.api.nvim_win_get_height(win)
  vim.api.nvim_win_call(win, function() vim.cmd 'wincmd _' end)
end

--- nvim-dap `terminal_win_cmd`: the buffer and window its integrated terminal
--- runs in. Returning the window lets nvim-dap size the pty to it; the window
--- is not entered, so `focus_terminal = false` still means no focus.
---@return integer buffer, integer window
function M.open_for_dap()
  local buf = vim.api.nvim_create_buf(true, false)
  return buf, open_below(buf, false)
end

--- Give a dap terminal a window if it has none. nvim-dap pools terminal
--- buffers and only calls `terminal_win_cmd` when the pool is empty, so from
--- the second debug run on it would otherwise write into an invisible buffer.
---@param buf integer
---@return integer window
function M.reveal_dap(buf) return window_for(buf) or open_below(buf, false) end

return M

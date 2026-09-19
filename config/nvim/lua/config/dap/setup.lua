-- Debugging for Node.js/TypeScript (config/dap/js.lua) and Go
-- (config/dap/go.lua): the session controls and the wiring between nvim-dap
-- and the integrated terminal. Required on the first debug key by
-- config/dap/init.lua, which owns the plugin list.

-- Values are capped so large payloads do not wrap the code line; inline
-- virtual text spanning many screen rows stalls redraw on cursor movement.
-- Full values remain reachable via hover (<leader>dh) and the scopes pane.
require('nvim-dap-virtual-text').setup {
  enabled = false,
  display_callback = function(variable, _, _, _, options)
    local value = variable.value:gsub('%s+', ' ')
    -- strcharpart, not sub: js-debug's summaries are full of multibyte glyphs
    -- (…, ƒ) and a byte slice through one renders as <e2>.
    if vim.fn.strchars(value) > 50 then value = vim.fn.strcharpart(value, 0, 50) .. '…' end
    if options.virt_text_pos == 'inline' then return ' = ' .. value end
    return variable.name .. ' = ' .. value
  end,
}

-- nvim-dap-virtual-text refreshes on every `variables` response, and both
-- consumers (nvim-dap, dap-view scopes) request variables per scope per stop.
-- Each refresh clears all extmarks and re-runs the treesitter locals query
-- over the whole buffer. Coalescing the burst into one refresh 20 ms after the
-- last response cut the per-step main-loop stall from 19 ms to 8 ms on a
-- 1100-line file (3 scopes) and from 37 ms to 17 ms on a 3300-line file, with
-- no visible delay (measured while nvim-dap-ui was still a third consumer).
-- The slot is assigned once in setup; DapVirtualTextToggle does not reassign
-- it.
do
  local variables = require('dap').listeners.after.variables
  local refresh = variables['nvim-dap-virtual-text']
  local pending
  variables['nvim-dap-virtual-text'] = function(session)
    if pending then
      pending:stop()
      pending:close()
    end
    pending = vim.defer_fn(function()
      pending = nil
      refresh(session)
    end, 20)
  end
end

require 'config.dap.view'

local terminal = require 'config.terminal'
local dap = require 'dap'

-- js-debug nests the real program under wrapper sessions (`nest start`
-- spawns `node dist/main`), and a stop focuses the innermost one.
-- dap.terminate() and dap.restart() act on the focused session only, which
-- leaves the wrapper alive holding the HTTP port; the next launch then
-- fails with EADDRINUSE. Terminate the whole hierarchy from the root, and
-- restart from the root's configuration once every session is gone.
local function root_session()
  local session = dap.session()
  if not session then return end
  while session.parent do
    session = session.parent
  end
  return session
end
local function terminate_debuggee()
  local root = root_session()
  if not root then return dap.terminate() end
  dap.set_session(root)
  dap.terminate { hierarchy = true }
end
local function restart_debuggee()
  local root = root_session()
  if not root then return end
  local config = root.config
  dap.set_session(root)
  local fired = false
  dap.terminate {
    hierarchy = true,
    on_done = vim.schedule_wrap(function()
      if fired then return end -- on_done fires once per session in the hierarchy
      fired = true
      vim.wait(5000, function() return vim.tbl_count(dap.sessions()) == 0 end, 100)
      dap.run(config)
    end),
  }
end

-- Sessions are closed only by terminate/disconnect; quitting with one active
-- orphans the detached adapter process. The terminal job (the debuggee) is
-- reaped by nvim's own exit.
vim.api.nvim_create_autocmd('VimLeavePre', {
  group = vim.api.nvim_create_augroup('dap_cleanup', { clear = true }),
  callback = function()
    for _, session in pairs(dap.sessions()) do
      pcall(function() session:close() end)
    end
  end,
})

-- Every launch focuses the integrated terminal in terminal mode
-- (focus_terminal below), so the session keys must work from there too; an
-- unmapped F-key in terminal mode is typed into the process as `^[OP`.
-- <leader> keys stay out of terminal mode so space remains typeable, and F9
-- stays normal-mode only because a breakpoint needs the cursor on a source
-- line. Shift-F5 and Ctrl-Shift-F5 are VS Code's stop and restart.
local session_modes = { 'n', 't' }
vim.keymap.set(session_modes, '<F5>', function() dap.continue() end, { desc = 'Debug: Start/Continue' })
vim.keymap.set(session_modes, '<F1>', function() dap.step_into() end, { desc = 'Debug: Step Into' })
vim.keymap.set(session_modes, '<F2>', function() dap.step_over() end, { desc = 'Debug: Step Over' })
vim.keymap.set(session_modes, '<F3>', function() dap.step_out() end, { desc = 'Debug: Step Out' })
vim.keymap.set(session_modes, '<S-F5>', terminate_debuggee, { desc = 'Debug: Terminate' })
vim.keymap.set(session_modes, '<C-S-F5>', restart_debuggee, { desc = 'Debug: Restart' })
vim.keymap.set(session_modes, '<F8>', '<cmd>DapViewToggle<CR>', { desc = 'Debug: Toggle DAP View' })
vim.keymap.set('n', '<leader>dt', terminate_debuggee, { desc = 'Debug: [T]erminate' })
vim.keymap.set('n', '<leader>dT', terminal.toggle_debug, { desc = 'Debug: Toggle integrated [T]erminal' })
vim.keymap.set('n', '<leader>dr', restart_debuggee, { desc = 'Debug: [R]estart' })
vim.keymap.set('n', '<leader>dc', function() dap.run_to_cursor() end, { desc = 'Debug: Run to [C]ursor' })
vim.keymap.set('n', '<leader>dl', function() dap.run_last() end, { desc = 'Debug: Run [L]ast' })
vim.keymap.set('n', '<leader>dp', function() dap.pause() end, { desc = 'Debug: [P]ause' })
vim.keymap.set('n', '<leader>d[', function() dap.up() end, { desc = 'Debug: Frame up (caller)' })
vim.keymap.set('n', '<leader>d]', function() dap.down() end, { desc = 'Debug: Frame down (callee)' })
vim.keymap.set('n', '<leader>b', function() dap.toggle_breakpoint() end, { desc = 'Debug: Toggle Breakpoint' })
-- F9 is VS Code's breakpoint key; the editor uses no function keys of its own.
vim.keymap.set('n', '<F9>', function() dap.toggle_breakpoint() end, { desc = 'Debug: Toggle Breakpoint' })
vim.keymap.set('n', '<leader>B', function() dap.set_breakpoint(vim.fn.input 'Breakpoint condition: ') end, { desc = 'Debug: Set Breakpoint' })
-- A logpoint prints its message (with {expr} interpolation) instead of stopping.
vim.keymap.set('n', '<leader>dL', function() dap.set_breakpoint(nil, nil, vim.fn.input 'Log message: ') end, { desc = 'Debug: Set [L]ogpoint' })
vim.keymap.set('n', '<leader>dv', '<cmd>DapVirtualTextToggle<CR>', { desc = 'Debug: Toggle [V]irtual text' })

-- The integrated terminal is a split under the code, owned by nvim-dap.
-- dap-view would otherwise carve the terminal out of its own panel (panel 30
-- wide, terminal 102 on the first stop) and hide it when the child session
-- exits, although the debug shell inside is still running. A string here
-- runs `belowright 15new` against the focused window, which puts the terminal
-- inside dap-view or neo-tree when the session is started from one; the
-- function anchors it on a code window instead.
dap.defaults.fallback.terminal_win_cmd = terminal.open_for_dap

-- Where the stopped frame is shown. nvim-dap's default, `uselast`, targets the
-- previously focused window whenever the current one holds a terminal or the
-- panel: a dap-view pane there has winfixbuf and the jump is skipped without
-- a message, and the neo-tree window has no winfixbuf and gets the source
-- file loaded into it. `useopen` finds the window already showing the file.
dap.defaults.fallback.switchbuf = 'usevisible,useopen,uselast'

-- Two gaps in nvim-dap's own terminal handling close here. It pools terminal
-- buffers and skips terminal_win_cmd whenever the pool is not empty, so every
-- run after the first writes into a buffer with no window; and focus_terminal
-- only searches for a window, so it silently does nothing in that case.
-- Deferred one tick because the job starts inside nvim_buf_call.
vim.api.nvim_create_autocmd('TermOpen', {
  group = vim.api.nvim_create_augroup('dap_terminal_insert', { clear = true }),
  callback = function(args)
    local dap_type = vim.b[args.buf]['dap-type']
    if not dap_type then return end
    vim.schedule(function()
      if not vim.api.nvim_buf_is_valid(args.buf) then return end
      local win = terminal.reveal_dap(args.buf)
      if not dap.defaults[dap_type].focus_terminal then return end
      vim.api.nvim_set_current_win(win)
      vim.cmd.startinsert()
    end)
  end,
})

vim.fn.sign_define('DapBreakpoint', { text = '●', texthl = 'DiagnosticError', numhl = 'DiagnosticError' })
vim.fn.sign_define('DapBreakpointCondition', { text = '◆', texthl = 'DiagnosticWarn', numhl = 'DiagnosticWarn' })
vim.fn.sign_define('DapLogPoint', { text = '◉', texthl = 'DiagnosticInfo', numhl = 'DiagnosticInfo' })
vim.fn.sign_define('DapStopped', { text = '▶', texthl = 'DiagnosticOk', linehl = 'DapStoppedLine', numhl = 'DiagnosticOk' })
vim.fn.sign_define('DapBreakpointRejected', { text = '✖', texthl = 'DiagnosticError', numhl = 'DiagnosticError' })

require 'config.dap.widgets'
require 'config.dap.go'
require 'config.dap.js'

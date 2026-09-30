vim.pack.add { 'https://github.com/NMAC427/guess-indent.nvim' }
require('guess-indent').setup {}

-- vim-be-good: practice game, only loaded with VIM_PRACTICE=1 (alias: vimpractice)
if vim.env.VIM_PRACTICE then vim.pack.add { 'https://github.com/ThePrimeagen/vim-be-good' } end

vim.pack.add { 'https://github.com/mikesmithgh/kitty-scrollback.nvim' }
require('kitty-scrollback').setup()

vim.pack.add { 'https://github.com/folke/which-key.nvim' }
require('which-key').setup {
  delay = 0,
  icons = { mappings = true },
  -- `expand` stays at its default 0, so the leader groups keep collapsing
  -- behind `+[D]ebug` and friends. Expanding them was tried and reverted:
  -- which-key anchors the popup at the bottom with `no_overlap = true`, so
  -- with the cursor low on screen all 62 leader mappings get squeezed into
  -- whatever rows are left under it and the popup turns into a scroller.
  -- `<leader>?` below is the place to read the whole chart.
  win = {
    -- `height.max` alone would not have helped. The popup is bottom-anchored
    -- and `check_overlap` (which-key/view.lua:486-502) rewrites the height
    -- to `lines - (cursor_row + 1)` whenever the popup would cover the
    -- cursor, after the max has already been applied. With the cursor eight
    -- rows off the bottom that is six rows, whatever the cap says.
    no_overlap = false,
    -- A fraction of the window rather than the classic preset's flat 25, so
    -- a taller terminal actually gets a taller chart. The remaining quarter
    -- keeps the lines around the cursor visible.
    height = { min = 4, max = 0.75 },
  },
  layout = {
    width = { min = 20, max = 50 },
    spacing = 3,
  },
  spec = {
    { '<leader>s', group = '[S]earch', mode = { 'n', 'v' } },
    { '<leader>t', group = '[T]oggle' },
    { '<leader>d', group = '[D]ebug', mode = { 'n', 'v' } },
    { '<leader>h', group = 'Git [H]unk', mode = { 'n', 'v' } },
    { '<leader>g', group = '[G]it diff', mode = { 'n', 'x' } },
    { '<leader>w', group = '[W]indow' },
    { '<leader>ws', group = '[S]wap' },
    { 'gr', group = 'LSP Actions', mode = { 'n' } },
  },
}

-- [[ smart-splits ]]
-- Directional window management: resize moves the divider in the pressed
-- direction from whichever side the cursor is on, instead of wider/narrower.
-- Alt+hjkl is owned by AeroSpace and Ctrl+Shift+h by kitty-scrollback, so
-- resize sits under <leader>w; <leader>wr opens which-key's Hydra mode so
-- hjkl can be tapped repeatedly until <Esc>.
vim.pack.add { 'https://github.com/smart-splits-nvim/smart-splits.nvim' }
local splits = require 'smart-splits'
splits.setup {
  default_amount = 3,
  at_edge = 'stop',
  -- kitty is auto-detected via $KITTY_LISTEN_ON, but the kittens are not
  -- installed; without this every edge move would shell out and fail.
  multiplexer_integration = false,
}
for key, dir in pairs { h = 'left', j = 'down', k = 'up', l = 'right' } do
  vim.keymap.set('n', '<C-' .. key .. '>', splits['move_cursor_' .. dir], { desc = 'Focus window ' .. dir })
  vim.keymap.set('n', '<leader>w' .. key, splits['resize_' .. dir], { desc = 'Resize ' .. dir })
  vim.keymap.set('n', '<leader>ws' .. key, splits['swap_buf_' .. dir], { desc = 'Swap buffer ' .. dir })
end
vim.keymap.set('n', '<leader>w=', '<C-w>=', { desc = 'Equalize windows' })
vim.keymap.set('n', '<leader>wr', function() require('which-key').show { keys = '<leader>w', loop = true } end, { desc = '[R]esize mode' })
vim.keymap.set('n', '<leader>?', '<Cmd>WhichKey<CR>', { desc = '[?] All keymaps' })

-- One label per tab page: the focused file's name. The default tabline
-- shortened whole paths, and CodeDiff, which opens every diff in its own tab
-- on codediff:// buffers, came out as `c////p/t/c/s/r///:/s/m/w/...`.
local function tab_label(tab)
  local label, modified = nil, false
  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(tab)) do
    local buf = vim.api.nvim_win_get_buf(win)
    local name = vim.api.nvim_buf_get_name(buf)
    modified = modified or vim.bo[buf].modified
    if not label and name:find '^codediff://' then label = 'diff: ' .. vim.fn.fnamemodify(name, ':t') end
  end
  local name = vim.api.nvim_buf_get_name(vim.api.nvim_win_get_buf(vim.api.nvim_tabpage_get_win(tab)))
  label = label or (name == '' and '[No Name]' or vim.fn.fnamemodify(name, ':t'))
  return label:gsub('%%', '%%%%') .. (modified and ' +' or '')
end

--- Renders 'tabline': clickable tabs labelled by file name.
---@return string
function _G.Tabline()
  local current = vim.api.nvim_get_current_tabpage()
  local parts = {}
  for index, tab in ipairs(vim.api.nvim_list_tabpages()) do
    local hl = tab == current and '%#TabLineSel#' or '%#TabLine#'
    parts[#parts + 1] = ('%s%%%dT %s '):format(hl, index, tab_label(tab))
  end
  return table.concat(parts) .. '%#TabLineFill#%T'
end
vim.o.tabline = '%!v:lua.Tabline()'

-- Fold arrows between the line numbers and the text, as in VS Code. The
-- built-in 'foldcolumn' prints the nesting level (`2`, `3`) on every line of a
-- fold nested deeper than the column is wide; this marks a fold's first line
-- only. VS Code's default (showFoldingControls "mouseover") is copied too: a
-- closed fold's arrow always shows, open folds' arrows only while the mouse
-- is over that window's gutter. The Material chevrons are the small, centred
-- ones; the codicon pair fills the whole cell.
local ARROW_OPEN, ARROW_CLOSED = '\u{f0140}', '\u{f0142}'

---@type integer? window whose gutter is under the mouse
local hovered_gutter

local fold_levels = {
  ['v:lua.vim.lsp.foldexpr()'] = vim.lsp.foldexpr,
  ['v:lua.vim.treesitter.foldexpr()'] = vim.treesitter.foldexpr,
}

---@param lnum integer
---@return boolean
local function starts_fold(lnum)
  local fold_level = vim.wo.foldmethod == 'expr' and fold_levels[vim.wo.foldexpr]
  if fold_level then return tostring(fold_level(lnum)):sub(1, 1) == '>' end
  return vim.fn.foldlevel(lnum) > vim.fn.foldlevel(lnum - 1)
end

--- Renders 'statuscolumn': signs, the line number, then a clickable fold arrow.
--- Windows without line numbers (neo-tree, terminals) keep the default columns.
---@return string
function _G.StatusColumn()
  if not (vim.wo.number or vim.wo.relativenumber) then return '%C%s' end
  local lnum, arrow = vim.v.lnum, ' '
  if vim.v.virtnum == 0 then
    if vim.fn.foldclosed(lnum) == lnum then
      arrow = '%#FoldColumn#' .. ARROW_CLOSED
    elseif hovered_gutter == vim.g.statusline_winid and starts_fold(lnum) then
      arrow = '%#FoldColumn#' .. ARROW_OPEN
    end
  end
  return '%s%=%l %@v:lua.StatusColumnFoldClick@' .. arrow .. '%T%* '
end

--- Click handler for the fold arrow: opens a closed fold, closes an open one
--- that starts on the clicked line, and ignores every other line.
function _G.StatusColumnFoldClick()
  local mouse = vim.fn.getmousepos()
  vim.api.nvim_win_call(mouse.winid, function()
    if vim.fn.foldclosed(mouse.line) ~= -1 then
      vim.cmd(mouse.line .. 'foldopen')
    elseif starts_fold(mouse.line) then
      vim.cmd(mouse.line .. 'foldclose')
    end
  end)
end
vim.o.statuscolumn = '%!v:lua.StatusColumn()'

-- Mouse movement reaches nvim only with 'mousemoveevent'; on_key sees it
-- without a mapping, so no mode's <MouseMove> is taken over.
vim.o.mousemoveevent = true
local MOUSE_MOVE = vim.keycode '<MouseMove>'
vim.on_key(function(key)
  if key ~= MOUSE_MOVE then return end
  local mouse = vim.fn.getmousepos()
  local info = mouse.winid ~= 0 and vim.fn.getwininfo(mouse.winid)[1]
  local hovered = info and mouse.wincol > 0 and mouse.wincol <= info.textoff and mouse.winid or nil
  if hovered == hovered_gutter then return end
  local previous = hovered_gutter
  hovered_gutter = hovered
  vim.schedule(function()
    for _, win in pairs { previous, hovered } do
      if vim.api.nvim_win_is_valid(win) then vim.api.nvim__redraw { win = win, statuscolumn = true } end
    end
  end)
end, vim.api.nvim_create_namespace 'fold-arrow-hover')

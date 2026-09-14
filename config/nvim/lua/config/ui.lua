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

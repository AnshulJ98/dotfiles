vim.pack.add {
  { src = 'https://github.com/nvim-neo-tree/neo-tree.nvim', version = vim.version.range '*' },
  'https://github.com/MunifTanjim/nui.nvim',
}

-- Configured on the first reveal. neo-tree's plugin/ file also opens the tree
-- for a directory argument (netrw hijack); that path takes its defaults,
-- where the only difference is that \ does not close the window.
local configured = false
vim.keymap.set('n', '\\', function()
  if not configured then
    configured = true
    require('neo-tree').setup {
      filesystem = {
        window = {
          mappings = {
            ['\\'] = 'close_window',
          },
        },
      },
    }
  end
  vim.cmd.Neotree 'reveal'
end, { desc = 'NeoTree reveal', silent = true })

-- LSP symbols in a right-hand panel, like VS Code's Outline view.
-- Closed by default; <leader>to toggles it without leaving the code.

vim.pack.add { 'https://github.com/hedyhli/outline.nvim' }

require('outline').setup {
  outline_window = {
    position = 'right',
    focus_on_open = false,
  },
}

vim.keymap.set('n', '<leader>to', '<Cmd>Outline<CR>', { desc = '[T]oggle [O]utline' })

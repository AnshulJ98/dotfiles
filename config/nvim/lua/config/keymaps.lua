-- Clear highlights on search when pressing <Esc> in normal mode
vim.keymap.set('n', '<Esc>', '<cmd>nohlsearch<CR>')

vim.diagnostic.config {
  update_in_insert = false,
  severity_sort = true,
  float = { border = 'rounded', source = 'if_many' },
  underline = { severity = { min = vim.diagnostic.severity.WARN } },
  -- Hints and infos stay off the sign column, which breakpoints share.
  signs = { severity = { min = vim.diagnostic.severity.WARN } },

  virtual_text = true,
  virtual_lines = false,

  -- Auto open the float, so you can easily read the errors when jumping with `[d` and `]d`
  jump = {
    on_jump = function(_, bufnr)
      vim.diagnostic.open_float {
        bufnr = bufnr,
        scope = 'cursor',
        focus = false,
      }
    end,
  },
}

vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostic [Q]uickfix list' })
vim.keymap.set('n', '<leader>td', function() vim.diagnostic.enable(not vim.diagnostic.is_enabled()) end, { desc = '[T]oggle [D]iagnostics' })

vim.keymap.set('n', '[q', '<cmd>cprev<CR>', { desc = 'Previous quickfix' })
vim.keymap.set('n', ']q', '<cmd>cnext<CR>', { desc = 'Next quickfix' })
vim.keymap.set('n', '[Q', '<cmd>cfirst<CR>', { desc = 'First quickfix' })
vim.keymap.set('n', ']Q', '<cmd>clast<CR>', { desc = 'Last quickfix' })

vim.keymap.set('t', '<Esc><Esc>', '<C-\\><C-n>', { desc = 'Exit terminal mode' })

-- Terminals live in config/terminal.lua: a plain shell and nvim-dap's
-- integrated terminal, both in a split below the code, both toggled from any
-- mode so neither costs a mode change first.
--
-- Measured on kitty 0.48.2 with nvim 0.12.5: Ctrl+/, Alt+/ and Alt+Enter all
-- arrive in normal, insert and terminal mode. <C-_> is the same shell toggle
-- for terminals without the kitty keyboard protocol, which send that for
-- Ctrl+/; inside kitty the chord is ctrl+shift+minus, kitty's
-- decrease-font-size, so there it never reaches nvim.
local term = require 'config.terminal'
local anywhere = { 'n', 'i', 't' }
vim.keymap.set(anywhere, '<C-/>', term.toggle_shell, { desc = 'Toggle terminal' })
vim.keymap.set(anywhere, '<C-_>', term.toggle_shell, { desc = 'Toggle terminal' })
vim.keymap.set(anywhere, '<M-/>', term.toggle_debug, { desc = 'Toggle debug terminal' })
vim.keymap.set(anywhere, '<M-CR>', term.toggle_maximize, { desc = 'Maximize terminal' })

vim.pack.add { 'https://github.com/mfussenegger/nvim-lint' }

local lint = require 'lint'

lint.linters.markdownlint.args = {
  '--stdin',
  '--config',
  vim.fn.expand '~' .. '/.markdownlint.jsonc',
}

lint.linters_by_ft = {
  markdown = { 'markdownlint' },
  python = { 'ruff' },
  sh = { 'shellcheck' },
  bash = { 'shellcheck' },
}

local lint_augroup = vim.api.nvim_create_augroup('lint', { clear = true })
vim.api.nvim_create_autocmd({ 'BufEnter', 'BufWritePost', 'InsertLeave' }, {
  group = lint_augroup,
  callback = function()
    -- Unmodifiable buffers, notably the markdown LSP hover pop-ups, would
    -- otherwise get linted too.
    if vim.bo.modifiable then lint.try_lint() end
  end,
})

vim.pack.add { 'https://github.com/stevearc/conform.nvim' }
require('conform').setup {
  notify_on_error = false,
  format_on_save = function(bufnr)
    local disabled_filetypes = { c = true, cpp = true, markdown = true }
    if disabled_filetypes[vim.bo[bufnr].filetype] then return nil end
    return { timeout_ms = 1000, lsp_format = 'fallback' }
  end,
  default_format_opts = {
    lsp_format = 'fallback',
  },
  formatters_by_ft = {
    javascript = { 'prettierd' },
    javascriptreact = { 'prettierd' },
    typescript = { 'prettierd' },
    typescriptreact = { 'prettierd' },
    json = { 'prettierd' },
    jsonc = { 'prettierd' },
    html = { 'prettierd' },
    css = { 'prettierd' },
    scss = { 'prettierd' },
    yaml = { 'prettierd' },
    markdown = { 'prettierd' },
    python = { 'ruff_organize_imports', 'ruff_format' },
    lua = { 'stylua' },
    sh = { 'shfmt' },
    bash = { 'shfmt' },
  },
  formatters = {
    shfmt = { prepend_args = { '-i', '2' } },
  },
}

vim.keymap.set({ 'n', 'v' }, '<leader>f', function() require('conform').format { async = true } end, { desc = '[F]ormat buffer' })

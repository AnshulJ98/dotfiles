vim.pack.add { 'https://github.com/MeanderingProgrammer/render-markdown.nvim' }

vim.api.nvim_create_autocmd('FileType', {
  desc = 'Conceal markdown markup',
  group = vim.api.nvim_create_augroup('markdown-conceal', { clear = true }),
  pattern = 'markdown',
  callback = function() vim.opt_local.conceallevel = 2 end,
})

require('render-markdown').setup {
  pipe_table = { enabled = false },
  -- No latex parser is installed; checkhealth warned on every run.
  latex = { enabled = false },
}
vim.pack.add { 'https://github.com/ice345/markdown-table-wrap.nvim' }
require('markdown-table-wrap').setup {
  preview_mode = 'inline',
  inline_mode = 'replace',
  inline_wrap_scope = 'always',
  inline_disable_wrap = true,
  row_separator = false,
}

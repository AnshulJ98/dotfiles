-- autopairs
-- https://github.com/windwp/nvim-autopairs

vim.pack.add { 'https://github.com/windwp/nvim-autopairs' }
require('nvim-autopairs').setup {
  fast_wrap = {},
  check_ts = true,
}

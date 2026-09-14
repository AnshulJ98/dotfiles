-- Go. nvim-dap-go is added in config/dap/init.lua.

require('dap-go').setup {
  delve = {
    detached = vim.fn.has 'win32' == 0,
  },
}

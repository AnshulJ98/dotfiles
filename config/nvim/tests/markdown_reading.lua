-- Over ssh (a kitty box window) <leader>mo reports LINE:PATH as the zmdread user var; no kitty socket is used.
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/config/nvim')
vim.g.mapleader = ' '
vim.env.KITTY_LISTEN_ON = nil
vim.env.SSH_CONNECTION = '10.0.0.2 50000 10.0.0.3 22'
dofile 'config/nvim/lua/config/markdown_reading.lua'
local path = vim.fn.tempname() .. ' notes.md'
vim.cmd.edit(vim.fn.fnameescape(path))
vim.api.nvim_buf_set_lines(0, 0, -1, false, { '# One', '', 'two', 'three' })
vim.api.nvim_win_set_cursor(0, { 3, 0 })
vim.bo.filetype = 'markdown'
local sent = {}
vim.api.nvim_ui_send = function(content) sent[#sent + 1] = content end
local map = vim.fn.maparg(' mo', 'n', false, true)
assert(map.callback, '<leader>mo is not mapped over ssh')
map.callback()
assert(#sent == 1, 'expected one terminal write, got ' .. #sent)
-- The buffer's own name: macOS resolves the tempname's /var to /private/var.
local name = vim.api.nvim_buf_get_name(0)
assert(name:sub(-#' notes.md') == ' notes.md', name)
assert(sent[1] == '\027]1337;SetUserVar=zmdread=' .. vim.base64.encode('3:' .. name) .. '\007', 'wrong report: ' .. vim.inspect(sent[1]))
assert(vim.fn.filereadable(path) == 1, 'the buffer was not saved before reporting')
print 'PASS: box <leader>mo reports the line and file to the kitty watcher'

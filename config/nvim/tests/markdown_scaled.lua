-- <leader>ms swaps the window to the reading view with scaled headings; <leader>mr swaps back and turns scaling off.
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/config/nvim')
vim.g.mapleader = ' '
vim.env.KITTY_LISTEN_ON = nil
vim.env.SSH_CONNECTION = nil
vim.env.MD_READING_OVERLAY = nil
dofile 'config/nvim/lua/config/markdown_reading.lua'
vim.cmd.edit(vim.fn.fnameescape(vim.fn.tempname() .. '.md'))
vim.api.nvim_buf_set_lines(0, 0, -1, false, { '# One', '', '## Two', '', 'text' })
vim.bo.filetype = 'markdown'
local source, win, wins = vim.api.nvim_get_current_buf(), vim.api.nvim_get_current_win(), #vim.api.nvim_list_wins()
local text_size = require 'md-render.text_size'

vim.fn.maparg(' ms', 'n', false, true).callback()
local rendered = vim.api.nvim_get_current_buf()
assert(vim.api.nvim_get_current_win() == win and #vim.api.nvim_list_wins() == wins, '<leader>ms opened a new window')
assert(rendered ~= source and vim.b[rendered].md_render, '<leader>ms did not swap in the reading view')
assert(text_size.config().enabled, '<leader>ms left scaling off')
assert(vim.b[rendered].minianimate_disable, 'animation stays on over scaled headings')

vim.fn.maparg(' mr', 'n', false, true).callback()
assert(vim.api.nvim_get_current_buf() == source, '<leader>mr did not swap back to the source')
assert(not text_size.config().enabled, '<leader>mr left scaling on')
print 'PASS: <leader>ms scales headings in the current window'

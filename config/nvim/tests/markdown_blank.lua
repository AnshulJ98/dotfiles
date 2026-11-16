-- A reading view whose render buffer was emptied behind md-render's back is
-- rebuilt when shown again, and the emptying is logged with a Lua traceback.
-- check.sh points XDG_STATE_HOME at a temporary directory for the log.
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/config/nvim')
vim.g.mapleader = ' '
dofile 'config/nvim/lua/config/markdown_reading.lua'
local path = vim.fn.tempname() .. '.md'
vim.fn.writefile({ '# One', '', 'two', '', '- three', '- four' }, path)
vim.cmd.edit(vim.fn.fnameescape(path))
vim.bo.filetype = 'markdown'
local toggle = vim.fn.maparg(' mr', 'n', false, true).callback
assert(toggle, '<leader>mr is not mapped')

toggle()
local render = vim.api.nvim_get_current_buf()
assert(vim.b[render].md_render, 'the reading view did not open')
local rendered = vim.api.nvim_buf_line_count(render)
assert(rendered > 1, 'the reading view rendered ' .. rendered .. ' lines')
vim.fn.maparg(' mr', 'n', false, true).callback()
assert(not vim.b[vim.api.nvim_get_current_buf()].md_render, 'did not return to the source')

-- The unknown culprit: some code deletes every line of the hidden render buffer.
local function empty_render_buffer()
  vim.bo[render].modifiable = true
  vim.api.nvim_buf_set_lines(render, 0, -1, false, {})
  vim.bo[render].modifiable = false
end
empty_render_buffer()
vim.wait(100) -- the log is written on the next loop tick

toggle()
assert(vim.api.nvim_get_current_buf() == render, 'the toggle did not reuse the render buffer')
local lines = vim.api.nvim_buf_line_count(render)
assert(lines == rendered, ('the reading view shows %d lines, expected %d'):format(lines, rendered))

local log = vim.fs.joinpath(vim.fn.stdpath 'state', 'md-render-blank.log')
assert(vim.fn.filereadable(log) == 1, 'no log at ' .. log)
local text = table.concat(vim.fn.readfile(log), '\n')
assert(text:find('empty_render_buffer', 1, true), 'the log has no traceback to the culprit:\n' .. text)
print 'PASS: an emptied reading view is rebuilt and the culprit is logged'

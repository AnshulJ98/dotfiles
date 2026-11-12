-- Run with nvim --headless -u NONE -l config/nvim/tests/meatcode.lua.
-- Uses the installed plugin's real page stack, but never calls its network/UI entrypoint.
for _, path in ipairs(vim.fn.globpath(vim.fn.stdpath 'data', 'site/pack/core/opt/*', false, true)) do
  vim.opt.runtimepath:append(path)
end

local pages = require 'meatcode.ui.pages'
local problem = require 'meatcode.ui.problem'
assert(type(pages.push) == 'function' and type(pages.depth) == 'function', 'MeatCode page API changed')
assert(type(problem.is_session_tab) == 'function', 'MeatCode problem-tab API changed')
local loads = 0
local setups = 0
-- The plugin manager and setup are I/O boundaries; the real pages remain in use.
package.loaded['which-key'] = { add = function() end }
package.loaded.meatcode = { setup = function() setups = setups + 1 end }
vim.pack.add = function(spec)
  assert(spec[1] == 'https://github.com/urwrstkn8mare/meatcode.nvim')
  loads = loads + 1
  vim.api.nvim_create_user_command('MeatCode', function()
    local buf = vim.api.nvim_create_buf(false, true)
    vim.bo[buf].filetype = 'meatcode-test'
    pages.push { id = 'test', buf = buf, title = 'Test page' }
  end, { nargs = '*', complete = function() return { 'home' } end })
end

dofile 'config/nvim/lua/config/meatcode.lua'
assert(loads == 0 and setups == 0, 'MeatCode loaded eagerly')
assert(vim.fn.maparg('<leader>nn', 'n') ~= '', 'Missing homepage mapping')
assert(vim.tbl_contains(vim.fn.getcompletion('MeatCode ', 'cmdline'), 'home'), 'First completion did not load the command')
assert(loads == 1 and setups == 1, 'Completion must load exactly once')

local original = vim.api.nvim_get_current_tabpage()
local editing = vim.api.nvim_get_current_buf()
vim.cmd.vsplit()
local original_windows = #vim.api.nvim_tabpage_list_wins(original)
vim.cmd.MeatCode()
assert(#vim.api.nvim_list_tabpages() == 2, 'First page must get its own tab')
assert(vim.api.nvim_get_current_tabpage() ~= original, 'Page replaced the editing tab')
assert(#vim.api.nvim_tabpage_list_wins(original) == original_windows, 'Page damaged the original split')
assert(vim.api.nvim_buf_is_valid(editing), 'Page deleted the editing buffer')
assert(vim.fn.maparg(string.char(92), 'n') == '<Nop>', 'NeoTree reveal remains active on a page')
vim.cmd.MeatCode()
assert(#vim.api.nvim_list_tabpages() == 2 and loads == 1, 'Nested page must not create another tab or reload')
pages.pop()
pages.pop()
assert(#vim.api.nvim_list_tabpages() == 1, 'Closing pages left a spare tab')
vim.cmd.MeatCode()
assert(#vim.api.nvim_list_tabpages() == 2, 'Reopening the homepage must get one tab')
print 'PASS: MeatCode lazy completion, private API contract, page isolation and reopening'

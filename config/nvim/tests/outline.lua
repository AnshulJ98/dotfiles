-- Real installed outline provider; no language server or network.
vim.g.mapleader = ' '
dofile 'config/nvim/lua/config/outline.lua'
vim.api.nvim_buf_set_lines(0, 0, -1, false, { '# First', '', '## Second' })
vim.bo.filetype = 'markdown'
local source = vim.api.nvim_get_current_win()
local function panel()
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    if vim.bo[vim.api.nvim_win_get_buf(win)].filetype == 'Outline' then return win end
  end
end

vim.api.nvim_feedkeys(' to', 'xt', false)
assert(vim.wait(2000, function() return panel() ~= nil end), 'leader-to must open the outline')
assert(vim.api.nvim_get_current_win() == source, 'opening the outline must keep focus in the code')
assert(vim.api.nvim_win_get_position(panel())[2] > vim.api.nvim_win_get_position(source)[2], 'outline must be on the right')
vim.api.nvim_feedkeys(' to', 'xt', false)
assert(not panel(), 'leader-to must also close the outline')
print 'PASS: right-side outline toggles on leader-to without stealing focus'

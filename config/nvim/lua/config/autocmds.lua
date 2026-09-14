vim.api.nvim_create_autocmd('TextYankPost', {
  desc = 'Highlight when yanking (copying) text',
  group = vim.api.nvim_create_augroup('highlight-yank', { clear = true }),
  callback = function() vim.hl.on_yank() end,
})

-- 'autoread' only compares timestamps after a shell command (`:help
-- timestamp`), so a file rewritten by a formatter, an agent in the
-- integrated terminal or another kitty tab stayed stale until `:!`.
-- `:checktime` is not allowed from the command-line window.
vim.api.nvim_create_autocmd({ 'FocusGained', 'BufEnter', 'TermClose', 'TermLeave' }, {
  desc = 'Reload files changed outside of nvim',
  group = vim.api.nvim_create_augroup('checktime', { clear = true }),
  callback = function()
    if vim.fn.getcmdwintype() == '' then vim.cmd.checktime() end
  end,
})

-- Only the focused window shows its cursor line, and terminals never do;
-- VS Code does the same. Every window is touched on each switch because a
-- window opened without entering it (the debugger panel) fires no WinEnter
-- of its own. BufWinEnter covers a buffer re-shown in a new window: that
-- restores the window options it was last hidden with, after WinEnter.
vim.api.nvim_create_autocmd({ 'WinEnter', 'BufWinEnter' }, {
  desc = 'Cursor line in the focused window only',
  group = vim.api.nvim_create_augroup('cursorline-focus', { clear = true }),
  callback = function()
    local current = vim.api.nvim_get_current_win()
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
      local is_terminal = vim.bo[vim.api.nvim_win_get_buf(win)].buftype == 'terminal'
      vim.wo[win][0].cursorline = win == current and not is_terminal
    end
  end,
})

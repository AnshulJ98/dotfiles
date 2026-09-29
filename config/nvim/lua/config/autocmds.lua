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

-- Reopen a file at the line it was left on, as VS Code does. nvim ships this
-- only as an example (`:help last-position-jump`); this is that example.
-- 'filetype' is still empty at BufReadPost, so the check waits for the
-- buffer's first FileType. Commit and rebase messages are new text each
-- time, xxd buffers are a transformed view, and diff mode aligns by hunk.
vim.api.nvim_create_autocmd('BufReadPre', {
  desc = 'Restore the cursor to its last position',
  group = vim.api.nvim_create_augroup('restore-cursor', { clear = true }),
  callback = function(args)
    vim.api.nvim_create_autocmd('FileType', {
      buffer = args.buf,
      once = true,
      callback = function()
        local line = vim.api.nvim_buf_get_mark(args.buf, '"')[1]
        local filetype = vim.bo[args.buf].filetype
        local excluded = filetype:find('commit', 1, true) or filetype == 'xxd' or filetype == 'gitrebase' or vim.wo.diff
        if line >= 1 and line <= vim.api.nvim_buf_line_count(args.buf) and not excluded then vim.cmd 'normal! g`"' end
      end,
    })
  end,
})

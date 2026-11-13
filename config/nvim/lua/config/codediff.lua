-- Side-by-side git diffs with VS Code's diff algorithm and character-level
-- highlights: the Source Control view's change list, "Open Changes" and
-- GitLens' file history. Each opens in its own tab; `q` closes it. The
-- plugin fetches a prebuilt C library on first use (`:CodeDiff install!`
-- forces a fresh download).

vim.pack.add { 'https://github.com/esmuellert/codediff.nvim' }
-- The default 1.4 multiplier makes subdued syntax disappear on changed characters.
require('codediff').setup { highlights = { char_brightness = 1.1 } }

vim.keymap.set('n', '<leader>gd', '<Cmd>CodeDiff<CR>', { desc = 'Git [D]iff: all changes' })
vim.keymap.set('n', '<leader>gf', '<Cmd>CodeDiff file HEAD<CR>', { desc = 'Git diff this [F]ile against HEAD' })
vim.keymap.set('n', '<leader>gh', '<Cmd>CodeDiff history %<CR>', { desc = 'Git [H]istory of this file' })
vim.keymap.set('x', '<leader>gh', ':CodeDiff history<CR>', { desc = 'Git [H]istory of the selected lines' })

-- Project-wide search and replace in an editable buffer, VS Code's Replace in
-- Files, on its Cmd+Shift+H. A visual selection seeds the search, as in VS
-- Code. Its buffer-local actions sit on <localleader>, which is Space here:
-- `<Space>r` replaces all, `g?` lists the rest.

vim.pack.add { 'https://github.com/MagicDuck/grug-far.nvim' }

local function replace_in_files()
  local grug_far = require 'grug-far'
  if vim.fn.mode():find '^[vV\22]' then
    grug_far.with_visual_selection()
  else
    grug_far.open()
  end
end

vim.keymap.set({ 'n', 'x' }, '<D-H>', replace_in_files, { desc = 'Replace in files' })
vim.keymap.set({ 'n', 'x' }, '<leader>sR', replace_in_files, { desc = '[S]earch and [R]eplace in files' })

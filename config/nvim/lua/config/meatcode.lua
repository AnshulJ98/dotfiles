-- LeetCode/NeetCode/LintCode inside Neovim, on trial: `:MeatCode` or
-- `<leader>nn` opens the homepage in its own tab. Nothing loads until the
-- command is first used or completed, so startup pays for one stub command
-- and one keymap. Uses telescope for the finder and fidget for progress.
--
-- To remove: delete this file and its require in init.lua, run
-- `:lua vim.pack.del { 'meatcode.nvim' }`, and delete
-- stdpath('cache')/meatcode (logins) and stdpath('data')/meatcode (solutions).

local function load()
  vim.api.nvim_del_user_command 'MeatCode'
  -- Sources plugin/meatcode.lua, which defines the real :MeatCode.
  vim.pack.add { 'https://github.com/urwrstkn8mare/meatcode.nvim' }
  require('meatcode').setup {
    lang = 'python', -- or 'cpp', 'swift', 'rust'; switch live with :MeatCode lang
    list = 'neetcode150', -- blind75 | neetcode150 | neetcode250 | allNC
  }

  -- Upstream shows the first page (home, roadmap, finder) in the current
  -- window of the current tab. From the neo-tree sidebar that lost the page
  -- and the sidebar; beside it, `q` closed the last editing window and
  -- neo-tree keys raised E5108 at nui/tree/init.lua:261. The first page gets
  -- its own tab instead, which `q` on that page closes. Patches an internal
  -- function, checked against meatcode.nvim 0641fa0be06983bdab24fdfde6504ee0ab2d8672;
  -- config/nvim/tests/meatcode.lua pins this behavior for plugin updates.
  local pages = require 'meatcode.ui.pages'
  local problem = require 'meatcode.ui.problem'
  local push = pages.push
  pages.push = function(page)
    if pages.depth() > 0 or problem.is_session_tab() then return push(page) end
    vim.cmd.tabnew()
    vim.bo.bufhidden = 'wipe'
    local tab = vim.api.nvim_get_current_tabpage()
    push(page)
    -- push went back to a pages tab it still tracked; drop the spare.
    if vim.api.nvim_get_current_tabpage() ~= tab then vim.cmd.tabclose(vim.api.nvim_tabpage_get_number(tab)) end
  end
end

-- `\` is NeoTree reveal (config.neotree). On a MeatCode page it asked to
-- change cwd to "MeatCode:", and answering y left the tree rooted at a path
-- that does not exist.
vim.api.nvim_create_autocmd('FileType', {
  desc = 'Disable NeoTree reveal on MeatCode pages',
  group = vim.api.nvim_create_augroup('meatcode-no-reveal', { clear = true }),
  pattern = 'meatcode-*',
  callback = function(args) vim.keymap.set('n', '\\', '<Nop>', { buffer = args.buf }) end,
})

-- The problem tab's buffer-local maps (run, submit, tests) also sit under
-- <leader>n; the homepage lists its own keys.
require('which-key').add { { '<leader>n', group = 'Meatcode [N]' } }
vim.keymap.set('n', '<leader>nn', '<Cmd>MeatCode<CR>', { desc = 'MeatCode: open the homepage' })

vim.api.nvim_create_user_command('MeatCode', function(cmd)
  load()
  vim.cmd { cmd = 'MeatCode', args = cmd.fargs }
end, {
  nargs = '*',
  desc = 'Load meatcode.nvim and run :MeatCode',
  complete = function(_, line)
    load()
    return vim.fn.getcompletion(line, 'cmdline')
  end,
})

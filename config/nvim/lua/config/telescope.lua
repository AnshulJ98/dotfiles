---@type (string|vim.pack.Spec)[]
local telescope_plugins = {
  'https://github.com/nvim-lua/plenary.nvim',
  'https://github.com/nvim-telescope/telescope.nvim',
  'https://github.com/nvim-telescope/telescope-ui-select.nvim',
}
if vim.fn.executable 'make' == 1 then table.insert(telescope_plugins, 'https://github.com/nvim-telescope/telescope-fzf-native.nvim') end

vim.pack.add(telescope_plugins)

-- setup, the two extensions and telescope.builtin cost 10 ms at startup and
-- are needed only once a picker opens, so every mapping below goes through
-- picker(), which configures on the first call.
local configured = false
local function configure()
  if configured then return end
  configured = true
  require('telescope').setup {
    defaults = {
      vimgrep_arguments = {
        'rg',
        '--color=never',
        '--no-heading',
        '--with-filename',
        '--line-number',
        '--column',
        '--smart-case',
        '--hidden',
        '--glob',
        '!**/.git/*',
      },
    },
    pickers = {
      find_files = {
        find_command = { 'rg', '--files', '--hidden', '--glob', '!**/.git/*' },
      },
    },
    extensions = {
      ['ui-select'] = { require('telescope.themes').get_dropdown() },
    },
  }
  pcall(require('telescope').load_extension, 'fzf')
  pcall(require('telescope').load_extension, 'ui-select')
end

---@param name string a telescope.builtin picker
---@param opts? table|fun(): table picker options, built per call when a function
local function picker(name, opts)
  return function()
    configure()
    require('telescope.builtin')[name](type(opts) == 'function' and opts() or opts)
  end
end

-- telescope-ui-select takes over vim.ui.select when its extension loads.
-- Until then a code action or rename prompt would get the builtin inputlist,
-- so the first call configures telescope and re-dispatches to whatever
-- vim.ui.select is by then.
local builtin_select = vim.ui.select
local function lazy_select(...)
  configure()
  if vim.ui.select == lazy_select then return builtin_select(...) end
  return vim.ui.select(...)
end
vim.ui.select = lazy_select

vim.keymap.set('n', '<leader>sh', picker 'help_tags', { desc = '[S]earch [H]elp' })
vim.keymap.set('n', '<leader>sk', picker 'keymaps', { desc = '[S]earch [K]eymaps' })
vim.keymap.set('n', '<leader>sf', picker 'find_files', { desc = '[S]earch [F]iles' })
vim.keymap.set('n', '<leader>ss', picker 'builtin', { desc = '[S]earch [S]elect Telescope' })
vim.keymap.set({ 'n', 'v' }, '<leader>sw', picker 'grep_string', { desc = '[S]earch current [W]ord' })
vim.keymap.set('n', '<leader>sg', picker 'live_grep', { desc = '[S]earch by [G]rep' })
vim.keymap.set('n', '<leader>sd', picker 'diagnostics', { desc = '[S]earch [D]iagnostics' })
vim.keymap.set('n', '<leader>sr', picker 'resume', { desc = '[S]earch [R]esume' })
vim.keymap.set('n', '<leader>s.', picker 'oldfiles', { desc = '[S]earch Recent Files ("." for repeat)' })
vim.keymap.set('n', '<leader>sc', picker 'commands', { desc = '[S]earch [C]ommands' })
vim.keymap.set('n', '<leader><leader>', picker 'buffers', { desc = '[ ] Find existing buffers' })

-- Add Telescope-based LSP pickers when an LSP attaches to a buffer.
-- If you later switch picker plugins, this is where to update these mappings.
vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('telescope-lsp-attach', { clear = true }),
  callback = function(event)
    local buf = event.buf
    vim.keymap.set('n', 'grr', picker 'lsp_references', { buffer = buf, desc = '[G]oto [R]eferences' })
    vim.keymap.set('n', 'gri', picker 'lsp_implementations', { buffer = buf, desc = '[G]oto [I]mplementation' })
    vim.keymap.set('n', 'grd', picker 'lsp_definitions', { buffer = buf, desc = '[G]oto [D]efinition' })
    vim.keymap.set('n', 'gO', picker 'lsp_document_symbols', { buffer = buf, desc = 'Open Document Symbols' })
    vim.keymap.set('n', 'gW', picker 'lsp_dynamic_workspace_symbols', { buffer = buf, desc = 'Open Workspace Symbols' })
    vim.keymap.set('n', 'grt', picker 'lsp_type_definitions', { buffer = buf, desc = '[G]oto [T]ype Definition' })
  end,
})

vim.keymap.set(
  'n',
  '<leader>/',
  picker(
    'current_buffer_fuzzy_find',
    function()
      return require('telescope.themes').get_dropdown {
        winblend = 10,
        previewer = false,
      }
    end
  ),
  { desc = '[/] Fuzzily search in current buffer' }
)

vim.keymap.set(
  'n',
  '<leader>s/',
  picker('live_grep', {
    grep_open_files = true,
    prompt_title = 'Live Grep in Open Files',
  }),
  { desc = '[S]earch [/] in Open Files' }
)

vim.keymap.set('n', '<leader>sn', picker('find_files', { cwd = vim.fn.stdpath 'config', follow = true }), { desc = '[S]earch [N]eovim files' })

-- The debugger loads on its first use. Setting up nvim-dap, dap-view, virtual
-- text and the two adapters took 6 ms of every start for a feature most
-- sessions never touch, so config/dap/setup.lua (which registers the full key
-- set, together with view.lua, widgets.lua and js.lua) waits for a debug key
-- or a Dap command.
--
-- The plugins are added by load(), not here: anything on the runtimepath at
-- the end of init.lua has its `plugin/` files sourced by :packloadall, whether
-- or not vim.pack.add was told to load them, and nvim-dap's plugin file
-- defines :DapContinue. A command that exists but runs with no adapter, no
-- terminal and no panel is worse than one that is missing, and CmdUndefined
-- below only fires while it is missing. The cost is that `:help dap` has no
-- tags until the first debug key.

---@type { [1]: string|string[], [2]: string }[] mode(s) and key
local trampolines = {
  { { 'n', 'v' }, '<leader>d' },
  { 'n', '<leader>b' },
  { 'n', '<leader>B' },
  { 'n', '<F9>' },
}
-- The session keys work from the integrated terminal too (see setup.lua).
for _, key in ipairs { '<F1>', '<F2>', '<F3>', '<F5>', '<S-F5>', '<C-S-F5>', '<F8>' } do
  table.insert(trampolines, { { 'n', 't' }, key })
end

local loaded = false
-- Adds the plugins (which sources their `plugin/` files, since this runs after
-- startup), then the config. The trampolines go first: setup.lua maps the same
-- keys, and deleting afterwards would take the real mappings with them.
local function load()
  if loaded then return end
  loaded = true
  for _, trampoline in ipairs(trampolines) do
    vim.keymap.del(trampoline[1], trampoline[2])
  end
  vim.pack.add {
    'https://github.com/mfussenegger/nvim-dap',
    'https://github.com/leoluz/nvim-dap-go',
    'https://github.com/theHamsta/nvim-dap-virtual-text',
    'https://github.com/igorlfs/nvim-dap-view',
  }
  require 'config.dap.setup'
end

-- A trampoline loads the debugger and replays its own key, so the mapping
-- setup.lua just made handles the press; for the <leader>d prefix the rest of
-- the chord is still in typeahead and lands after the replayed prefix.
for _, trampoline in ipairs(trampolines) do
  local modes, lhs = trampoline[1], trampoline[2]
  vim.keymap.set(modes, lhs, function()
    load()
    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(lhs, true, false, true), 'mi', false)
  end, { desc = 'Debug: load the debugger' })
end

-- Nvim retries the command once the autocmd returns, so :DapContinue and
-- :DapViewToggle run as typed, with the adapters and the panel configured.
vim.api.nvim_create_autocmd('CmdUndefined', {
  group = vim.api.nvim_create_augroup('dap_lazy_commands', { clear = true }),
  pattern = 'Dap*',
  callback = load,
})

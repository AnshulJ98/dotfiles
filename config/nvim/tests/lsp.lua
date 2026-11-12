-- Run with nvim --headless -u NONE -l config/nvim/tests/lsp.lua.
-- Do not install tools or start servers during a configuration regression test.
local executable = vim.fn.executable
local captured
vim.pack.add = function() end
package.loaded.mason = { setup = function() end }
package.loaded['mason-tool-installer'] = { setup = function(options) captured = options.ensure_installed end }
vim.lsp.enable = function() end

for _, has_go in ipairs { false, true } do
  vim.fn.executable = function(name)
    if name == 'go' then return has_go and 1 or 0 end
    return executable(name)
  end
  dofile 'config/nvim/lua/config/lsp.lua'
  assert(vim.tbl_contains(captured, 'delve') == has_go, 'Delve must be installed only when Go exists')
  assert(vim.tbl_contains(captured, 'js-debug-adapter'), 'Other debug adapters must remain installed')
end
vim.fn.executable = executable
print 'PASS: Delve tool installation with and without Go'

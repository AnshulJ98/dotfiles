-- Exercise the configured key and directory handling with real installed plugins.
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/config/nvim')
dofile 'config/nvim/lua/config/mini.lua'

local function toggle()
  local mapping = vim.fn.maparg('\\', 'n', false, true)
  assert(type(mapping.callback) == 'function', 'backslash must open the file browser')
  mapping.callback()
end

local file = vim.fn.getcwd() .. '/config/nvim/init.lua'
vim.cmd.edit(file)
toggle()
assert(MiniFiles and MiniFiles.get_explorer_state(), 'backslash must open mini.files')
assert(MiniFiles.get_fs_entry().path == file, 'mini.files must reveal the current file')
toggle()
assert(not MiniFiles.get_explorer_state(), 'backslash must close mini.files')

vim.cmd.enew()
toggle()
assert(MiniFiles.get_explorer_state(), 'mini.files must also open from an unnamed buffer')
toggle()

vim.cmd.edit(vim.fn.getcwd() .. '/config/nvim')
assert(vim.wait(1000, function() return MiniFiles.get_explorer_state() ~= nil end), 'opening a directory must use mini.files')
toggle()

print 'PASS: mini.files toggle, current file, unnamed buffers and directories'

vim.loader.enable()

-- Must be set before any mapping is created.
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- The order below is the order these ran as one file, and two pairs depend on
-- it: config.mini mocks nvim-web-devicons for config.telescope and
-- config.neotree, and config.colorscheme clears every highlight group, so it
-- precedes the modules that only link to the theme's.
require 'config.options'
require 'config.keymaps'
require 'config.autocmds'
require 'config.pack'
require 'config.ui'
require 'config.colorscheme'
require 'config.markdown'
require 'config.mini'
require 'config.telescope'
require 'config.lsp'
require 'config.format'
require 'config.completion'
require 'config.treesitter'
require 'config.dap'
require 'config.indent_line'
require 'config.lint'
require 'config.autopairs'
require 'config.neotree'
require 'config.gitsigns'

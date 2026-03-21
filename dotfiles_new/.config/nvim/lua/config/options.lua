-- Options are automatically loaded before lazy.nvim startup
-- Default options: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua

-- Line numbers
vim.opt.number = true
vim.opt.relativenumber = false

-- Transparency support for colorscheme
vim.g.bearded_transparent = false

-- Smooth scrolling (matches VSCode smoothScrolling)
vim.opt.smoothscroll = true

-- Fold settings (matches VSCode showFoldingControls: always)
vim.opt.foldcolumn = "1"
vim.opt.foldlevel = 99
vim.opt.foldlevelstart = 99
vim.opt.foldenable = true

-- Tab/indent (2 spaces like VSCode default)
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true
vim.opt.smartindent = true

-- Scrolloff (keep context visible)
vim.opt.scrolloff = 8
vim.opt.sidescrolloff = 8

-- Search
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.hlsearch = true
vim.opt.incsearch = true

-- UI
vim.opt.termguicolors = true
vim.opt.showmode = false
vim.opt.cursorline = true
vim.opt.signcolumn = "yes"
vim.opt.pumblend = 10
vim.opt.winblend = 10
vim.opt.pumheight = 15

-- Split behavior (matches VSCode panel behavior)
vim.opt.splitbelow = true
vim.opt.splitright = true
vim.opt.splitkeep = "screen"

-- Scrollback / history
vim.opt.undofile = true
vim.opt.undolevels = 10000

-- Clipboard (use system clipboard)
vim.opt.clipboard = "unnamedplus"

-- Completion
vim.opt.completeopt = "menu,menuone,noselect"

-- Reduce update time for better UX
vim.opt.updatetime = 200
vim.opt.timeoutlen = 300

-- Fill chars for clean UI
vim.opt.fillchars = {
  diff = "╱",
  eob = " ",
}

-- Concealment for markdown rendering
vim.opt.conceallevel = 2

-- Spelling
vim.opt.spell = false
vim.opt.spelllang = { "en" }

-- Wrap (off like VSCode default)
vim.opt.wrap = false

-- Mouse
vim.opt.mouse = "a"
vim.opt.mousemoveevent = true

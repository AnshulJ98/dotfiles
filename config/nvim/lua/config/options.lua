-- Options are automatically loaded before lazy.nvim startup
-- Default options: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua

-- Line numbers
vim.opt.number = true
vim.opt.relativenumber = false

-- Transparency support for colorscheme
vim.g.bearded_transparent = true

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

-- UI (only deltas from LazyVim defaults)
vim.opt.termguicolors = true
vim.opt.pumblend = 10
vim.opt.winblend = 10
vim.opt.pumheight = 15

-- Split behavior delta: keep view stable when opening splits
vim.opt.splitkeep = "screen"

-- Undo history (longer than LazyVim default)
vim.opt.undolevels = 10000

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

-- Hover-aware mouse for hl groups / scrollbar
vim.opt.mousemoveevent = true

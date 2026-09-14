vim.o.number = true
vim.o.relativenumber = true

vim.o.mouse = 'a'

-- Don't show the mode, since it's already in the status line
vim.o.showmode = false

-- Sync clipboard between OS and Neovim, scheduled after `UiEnter` because
-- it can increase startup-time.
vim.schedule(function() vim.o.clipboard = 'unnamedplus' end)

vim.o.breakindent = true

vim.o.undofile = true

-- Case-insensitive searching UNLESS \C or one or more capital letters in the search term
vim.o.ignorecase = true
vim.o.smartcase = true

vim.o.signcolumn = 'yes'

vim.o.updatetime = 250

vim.o.timeoutlen = 300

vim.o.splitright = true
vim.o.splitbelow = true

vim.o.list = true
vim.opt.listchars = { tab = '» ', trail = '·', nbsp = '␣' }
-- No `~` filler past the end of a buffer (code windows and the dap-view panel)
-- and no `-` filler after a closed fold's text.
vim.opt.fillchars:append { eob = ' ', fold = ' ' }

-- A closed fold shows its first line in syntax colours instead of `+--`.
vim.o.foldtext = ''

-- Wrapped continuation lines are marked; 'breakindent' above aligns them.
vim.o.showbreak = '↪ '

-- One statusline for the whole screen. With one per window, neo-tree, the
-- terminal and the debugger panel each drew a line of junk, and the code
-- window's own line truncated its path once the panel took 60 columns.
vim.o.laststatus = 3

-- Opening the terminal or the debugger panel keeps the text in place rather
-- than scrolling the code window to hold the cursor row.
vim.o.splitkeep = 'screen'

-- kitty shows the window title in its tab: `file - project`.
vim.o.title = true
vim.o.titlestring = "%t%( %M%) - %{fnamemodify(getcwd(), ':t')}"

-- No remote plugins are in use; the providers only cost startup time and
-- checkhealth warnings.
vim.g.loaded_node_provider = 0
vim.g.loaded_perl_provider = 0
vim.g.loaded_python3_provider = 0
vim.g.loaded_ruby_provider = 0

vim.o.inccommand = 'split'

vim.o.cursorline = true

-- Floating windows that pass no border of their own (LSP hover, blink menu
-- and docs, which-key, dap-view hover) get one, so they stand off the code.
-- The wildmenu and the native completion popup take the same border.
vim.o.winborder = 'rounded'
vim.o.pumborder = 'rounded'

vim.o.scrolloff = 10

-- Treesitter folding: start with all folds open, close manually with zc/zM
vim.o.foldlevel = 99

vim.o.confirm = true

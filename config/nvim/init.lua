--[[

=====================================================================
==================== READ THIS BEFORE CONTINUING ====================
=====================================================================
========                                    .-----.          ========
========         .----------------------.   | === |          ========
========         |.-""""""""""""""""""-.|   |-----|          ========
========         ||                    ||   | === |          ========
========         ||   KICKSTART.NVIM   ||   |-----|          ========
========         ||                    ||   | === |          ========
========         ||                    ||   |-----|          ========
========         ||:Tutor              ||   |:::::|          ========
========         |'-..................-'|   |____o|          ========
========         `"")----------------(""`   ___________      ========
========        /::::::::::|  |::::::::::\  \ no mouse \     ========
========       /:::========|  |==hjkl==:::\  \ required \    ========
========      '""""""""""""'  '""""""""""""'  '""""""""""'   ========
========                                                     ========
=====================================================================
=====================================================================

What is Kickstart?

  Kickstart.nvim is *not* a distribution.

  Kickstart.nvim is a starting point for your own configuration.
    The goal is that you can read every line of code, top-to-bottom, understand
    what your configuration is doing, and modify it to suit your needs.

    Once you've done that, you can start exploring, configuring and tinkering to
    make Neovim your own! That might mean leaving Kickstart just the way it is for a while
    or immediately breaking it into modular pieces. It's up to you!

    If you don't know anything about Lua, I recommend taking some time to read through
    a guide. One possible example which will only take 10-15 minutes:
      - https://learnxinyminutes.com/docs/lua/

    After understanding a bit more about Lua, you can use `:help lua-guide` as a
    reference for how Neovim integrates Lua.
    - :help lua-guide
    - (or HTML version): https://neovim.io/doc/user/lua-guide.html

Kickstart Guide:

  TODO: The very first thing you should do is to run the command `:Tutor` in Neovim.

    If you don't know what this means, type the following:
      - <escape key>
      - :
      - Tutor
      - <enter key>

    (If you already know the Neovim basics, you can skip this step.)

  Once you've completed that, you can continue working through **AND READING** the rest
  of the kickstart init.lua.

  Next, run AND READ `:help`.
    This will open up a help window with some basic information
    about reading, navigating and searching the builtin help documentation.

    This should be the first place you go to look when you're stuck or confused
    with something. It's one of my favorite Neovim features.

    MOST IMPORTANTLY, we provide a keymap "<space>sh" to [s]earch the [h]elp documentation,
    which is very useful when you're not exactly sure of what you're looking for.

  I have left several `:help X` comments throughout the init.lua
    These are hints about where to find more information about the relevant settings,
    plugins or Neovim features used in Kickstart.

   NOTE: Look for lines like this

    Throughout the file. These are for you, the reader, to help you understand what is happening.
    Feel free to delete them once you know what you're doing, but they should serve as a guide
    for when you are first encountering a few different constructs in your Neovim config.

If you experience any errors while trying to install kickstart, run `:checkhealth` for more info.

I hope you enjoy your Neovim journey,
- TJ

P.S. You can delete this when you're done too. It's your config now! :)
--]]

-- ============================================================
-- SECTION 1: OPTIONS
-- Core Neovim settings, leaders, options, basic keymaps, basic autocmds
-- ============================================================
do
  -- Enable faster startup by caching compiled Lua modules
  vim.loader.enable()

  -- Set <space> as the leader key
  -- See `:help mapleader`
  --  NOTE: Must happen before plugins are loaded (otherwise wrong leader will be used)
  vim.g.mapleader = ' '
  vim.g.maplocalleader = ' '

  -- Set to true if you have a Nerd Font installed and selected in the terminal
  vim.g.have_nerd_font = true

  -- [[ Setting options ]]
  --  See `:help vim.o`
  -- NOTE: You can change these options as you wish!
  --  For more options, you can see `:help option-list`

  -- Make line numbers default
  vim.o.number = true
  vim.o.relativenumber = true

  -- Enable mouse mode, can be useful for resizing splits for example!
  vim.o.mouse = 'a'

  -- Don't show the mode, since it's already in the status line
  vim.o.showmode = false

  -- Sync clipboard between OS and Neovim.
  --  Schedule the setting after `UiEnter` because it can increase startup-time.
  --  Remove this option if you want your OS clipboard to remain independent.
  --  See `:help 'clipboard'`
  vim.schedule(function() vim.o.clipboard = 'unnamedplus' end)

  -- Enable break indent
  vim.o.breakindent = true

  -- Enable undo/redo changes even after closing and reopening a file
  vim.o.undofile = true

  -- Case-insensitive searching UNLESS \C or one or more capital letters in the search term
  vim.o.ignorecase = true
  vim.o.smartcase = true

  -- Keep signcolumn on by default
  vim.o.signcolumn = 'yes'

  -- Decrease update time
  vim.o.updatetime = 250

  -- Decrease mapped sequence wait time
  vim.o.timeoutlen = 300

  -- Configure how new splits should be opened
  vim.o.splitright = true
  vim.o.splitbelow = true

  -- Sets how neovim will display certain whitespace characters in the editor.
  --  See `:help 'list'`
  --  and `:help 'listchars'`
  --
  --  Notice listchars is set using `vim.opt` instead of `vim.o`.
  --  It is very similar to `vim.o` but offers an interface for conveniently interacting with tables.
  --   See `:help lua-options`
  --   and `:help lua-guide-options`
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

  -- Preview substitutions live, as you type!
  vim.o.inccommand = 'split'

  -- Show which line your cursor is on
  vim.o.cursorline = true

  -- Floating windows that pass no border of their own (LSP hover, blink menu
  -- and docs, which-key, dap-view hover) get one, so they stand off the code.
  -- The wildmenu and the native completion popup take the same border.
  vim.o.winborder = 'rounded'
  vim.o.pumborder = 'rounded'

  -- Minimal number of screen lines to keep above and below the cursor.
  vim.o.scrolloff = 10

  -- Treesitter folding: start with all folds open, close manually with zc/zM
  vim.o.foldlevel = 99

  -- if performing an operation that would fail due to unsaved changes in the buffer (like `:q`),
  -- instead raise a dialog asking if you wish to save the current file(s)
  -- See `:help 'confirm'`
  vim.o.confirm = true
end

-- ============================================================
-- SECTION 2: KEYMAPS
-- basic keymaps
-- ============================================================
do
  -- [[ Basic Keymaps ]]
  --  See `:help vim.keymap.set()`

  -- Clear highlights on search when pressing <Esc> in normal mode
  --  See `:help hlsearch`
  vim.keymap.set('n', '<Esc>', '<cmd>nohlsearch<CR>')

  -- Diagnostic Config & Keymaps
  --  See `:help vim.diagnostic.Opts`
  vim.diagnostic.config {
    update_in_insert = false,
    severity_sort = true,
    float = { border = 'rounded', source = 'if_many' },
    underline = { severity = { min = vim.diagnostic.severity.WARN } },
    -- Hints and infos stay off the sign column, which breakpoints share.
    signs = { severity = { min = vim.diagnostic.severity.WARN } },

    -- Can switch between these as you prefer
    virtual_text = true, -- Text shows up at the end of the line
    virtual_lines = false, -- Text shows up underneath the line, with virtual lines

    -- Auto open the float, so you can easily read the errors when jumping with `[d` and `]d`
    jump = {
      on_jump = function(_, bufnr)
        vim.diagnostic.open_float {
          bufnr = bufnr,
          scope = 'cursor',
          focus = false,
        }
      end,
    },
  }

  vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostic [Q]uickfix list' })
  vim.keymap.set('n', '<leader>td', function() vim.diagnostic.enable(not vim.diagnostic.is_enabled()) end, { desc = '[T]oggle [D]iagnostics' })

  vim.keymap.set('n', '[q', '<cmd>cprev<CR>', { desc = 'Previous quickfix' })
  vim.keymap.set('n', ']q', '<cmd>cnext<CR>', { desc = 'Next quickfix' })
  vim.keymap.set('n', '[Q', '<cmd>cfirst<CR>', { desc = 'First quickfix' })
  vim.keymap.set('n', ']Q', '<cmd>clast<CR>', { desc = 'Last quickfix' })

  -- Exit terminal mode in the builtin terminal with a shortcut that is a bit easier
  -- for people to discover. Otherwise, you normally need to press <C-\><C-n>, which
  -- is not what someone will guess without a bit more experience.
  --
  -- NOTE: This won't work in all terminal emulators/tmux/etc. Try your own mapping
  -- or just use <C-\><C-n> to exit terminal mode
  vim.keymap.set('t', '<Esc><Esc>', '<C-\\><C-n>', { desc = 'Exit terminal mode' })

  -- Terminals live in kickstart/terminal.lua: a plain shell and nvim-dap's
  -- integrated terminal, both in a split below the code, both toggled from any
  -- mode so neither costs a mode change first.
  --
  -- Measured on kitty 0.48.2 with nvim 0.12.5: Ctrl+/, Alt+/ and Alt+Enter all
  -- arrive in normal, insert and terminal mode. <C-_> is the same shell toggle
  -- for terminals without the kitty keyboard protocol, which send that for
  -- Ctrl+/; inside kitty the chord is ctrl+shift+minus, kitty's
  -- decrease-font-size, so there it never reaches nvim.
  do
    local term = require 'kickstart.terminal'
    local anywhere = { 'n', 'i', 't' }
    vim.keymap.set(anywhere, '<C-/>', term.toggle_shell, { desc = 'Toggle terminal' })
    vim.keymap.set(anywhere, '<C-_>', term.toggle_shell, { desc = 'Toggle terminal' })
    vim.keymap.set(anywhere, '<M-/>', term.toggle_debug, { desc = 'Toggle debug terminal' })
    vim.keymap.set(anywhere, '<M-CR>', term.toggle_maximize, { desc = 'Maximize terminal' })
  end

  -- TIP: Disable arrow keys in normal mode
  -- vim.keymap.set('n', '<left>', '<cmd>echo "Use h to move!!"<CR>')
  -- vim.keymap.set('n', '<right>', '<cmd>echo "Use l to move!!"<CR>')
  -- vim.keymap.set('n', '<up>', '<cmd>echo "Use k to move!!"<CR>')
  -- vim.keymap.set('n', '<down>', '<cmd>echo "Use j to move!!"<CR>')

  -- Window navigation, resize, and swap keymaps live with smart-splits in SECTION 4.

  -- [[ Basic Autocommands ]]
  --  See `:help lua-guide-autocommands`

  -- Highlight when yanking (copying) text
  --  Try it with `yap` in normal mode
  --  See `:help vim.hl.on_yank()`
  vim.api.nvim_create_autocmd('TextYankPost', {
    desc = 'Highlight when yanking (copying) text',
    group = vim.api.nvim_create_augroup('kickstart-highlight-yank', { clear = true }),
    callback = function() vim.hl.on_yank() end,
  })

  -- 'autoread' only compares timestamps after a shell command (`:help
  -- timestamp`), so a file rewritten by a formatter, an agent in the
  -- integrated terminal or another kitty tab stayed stale until `:!`.
  -- `:checktime` is not allowed from the command-line window.
  vim.api.nvim_create_autocmd({ 'FocusGained', 'BufEnter', 'TermClose', 'TermLeave' }, {
    desc = 'Reload files changed outside of nvim',
    group = vim.api.nvim_create_augroup('kickstart-checktime', { clear = true }),
    callback = function()
      if vim.fn.getcmdwintype() == '' then vim.cmd.checktime() end
    end,
  })

  -- Only the focused window shows its cursor line, and terminals never do;
  -- VS Code does the same. Every window is touched on each switch because a
  -- window opened without entering it (the debugger panel) fires no WinEnter
  -- of its own. BufWinEnter covers a buffer re-shown in a new window: that
  -- restores the window options it was last hidden with, after WinEnter.
  vim.api.nvim_create_autocmd({ 'WinEnter', 'BufWinEnter' }, {
    desc = 'Cursor line in the focused window only',
    group = vim.api.nvim_create_augroup('kickstart-cursorline-focus', { clear = true }),
    callback = function()
      local current = vim.api.nvim_get_current_win()
      for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
        local is_terminal = vim.bo[vim.api.nvim_win_get_buf(win)].buftype == 'terminal'
        vim.wo[win][0].cursorline = win == current and not is_terminal
      end
    end,
  })
end

-- ============================================================
-- SECTION 3: PLUGIN MANAGER INTRO
-- vim.pack intro, build hooks
-- ============================================================
do
  -- [[ Intro to `vim.pack` ]]
  -- `vim.pack` is a new plugin manager built into Neovim,
  --  which provides a Lua interface for installing and managing plugins.
  --
  --  See `:help vim.pack`, `:help vim.pack-examples` or the
  --  excellent blog post from the creator of vim.pack and mini.nvim:
  --  https://echasnovski.com/blog/2026-03-13-a-guide-to-vim-pack
  --
  --  To inspect plugin state and pending updates, run
  --    :lua vim.pack.update(nil, { offline = true })
  --
  --  To update plugins, run
  --    :lua vim.pack.update()
  --
  --
  --  Throughout the rest of the config there will be examples
  --  of how to install and configure plugins using `vim.pack`.
  --
  --  In this section we set up some autocommands to run build
  --  steps for certain plugins after they are installed or updated.

  local function run_build(name, cmd, cwd)
    local result = vim.system(cmd, { cwd = cwd }):wait()
    if result.code ~= 0 then
      local stderr = result.stderr or ''
      local stdout = result.stdout or ''
      local output = stderr ~= '' and stderr or stdout
      if output == '' then output = 'No output from build command.' end
      vim.notify(('Build failed for %s:\n%s'):format(name, output), vim.log.levels.ERROR)
    end
  end

  -- This autocommand runs after a plugin is installed or updated and
  --  runs the appropriate build command for that plugin if necessary.
  --
  -- See `:help vim.pack-events`
  vim.api.nvim_create_autocmd('PackChanged', {
    callback = function(ev)
      local name = ev.data.spec.name
      local kind = ev.data.kind
      if kind ~= 'install' and kind ~= 'update' then return end

      if name == 'telescope-fzf-native.nvim' and vim.fn.executable 'make' == 1 then
        run_build(name, { 'make' }, ev.data.path)
        return
      end

      if name == 'nvim-treesitter' then
        if not ev.data.active then vim.cmd.packadd 'nvim-treesitter' end
        vim.cmd 'TSUpdate'
        return
      end
    end,
  })
end

---Because most plugins are hosted on GitHub, you can use the helper
---function to have less repetition in the following sections.
---@param repo string
---@return string
local function gh(repo) return 'https://github.com/' .. repo end

-- ============================================================
-- SECTION 4: UI / CORE UX PLUGINS
-- guess-indent, gitsigns, which-key, colorscheme, todo-comments, mini modules
-- ============================================================
do
  -- [[ Installing and Configuring Plugins ]]
  --
  -- To install a plugin simply call `vim.pack.add` with its git url.
  -- This will download the default branch of the plugin, which will usually be `main` or `master`
  -- You can also have more advanced specs, which we will talk about later.
  --
  -- For most plugins its not enough to install them, you also need to call their `.setup()` to start them.
  --
  -- For example, lets say we want to install `guess-indent.nvim` - a plugin for
  -- automatically detecting and setting the indentation.
  --
  -- We first install it from https://github.com/NMAC427/guess-indent.nvim
  -- and then call its `setup()` function to start it with default settings.
  vim.pack.add { gh 'NMAC427/guess-indent.nvim' }
  require('guess-indent').setup {}

  -- vim-be-good: practice game, only loaded with VIM_PRACTICE=1 (alias: vimpractice)
  if vim.env.VIM_PRACTICE then vim.pack.add { gh 'ThePrimeagen/vim-be-good' } end

  --kitty scrollback to open bufferrs in nvim
  vim.pack.add { gh 'mikesmithgh/kitty-scrollback.nvim' }
  require('kitty-scrollback').setup()

  -- Here is a more advanced configuration example that passes options to `gitsigns.nvim`
  --
  -- See `:help gitsigns` to understand what each configuration key does.
  -- Adds git related signs to the gutter, as well as utilities for managing changes
  -- gitsigns: plugin loaded + setup + keymaps consolidated in kickstart/plugins/gitsigns.lua

  -- Useful plugin to show you pending keybinds.
  vim.pack.add { gh 'folke/which-key.nvim' }
  require('which-key').setup {
    -- Delay between pressing a key and opening which-key (milliseconds)
    delay = 0,
    icons = { mappings = vim.g.have_nerd_font },
    layout = {
      width = { min = 20, max = 50 },
      spacing = 3,
    },
    -- Document existing key chains
    spec = {
      { '<leader>s', group = '[S]earch', mode = { 'n', 'v' } },
      { '<leader>t', group = '[T]oggle' },
      { '<leader>d', group = '[D]ebug', mode = { 'n', 'v' } },
      { '<leader>h', group = 'Git [H]unk', mode = { 'n', 'v' } }, -- Enable gitsigns recommended keymaps first
      { '<leader>w', group = '[W]indow' },
      { '<leader>ws', group = '[S]wap' },
      { 'gr', group = 'LSP Actions', mode = { 'n' } },
    },
  }

  -- [[ smart-splits ]]
  -- Directional window management: resize moves the divider in the pressed
  -- direction from whichever side the cursor is on, instead of wider/narrower.
  -- Alt+hjkl is owned by AeroSpace and Ctrl+Shift+h by kitty-scrollback, so
  -- resize sits under <leader>w; <leader>wr opens which-key's Hydra mode so
  -- hjkl can be tapped repeatedly until <Esc>.
  vim.pack.add { gh 'smart-splits-nvim/smart-splits.nvim' }
  local splits = require 'smart-splits'
  splits.setup {
    default_amount = 3,
    at_edge = 'stop',
    -- kitty is auto-detected via $KITTY_LISTEN_ON, but the kittens are not
    -- installed; without this every edge move would shell out and fail.
    multiplexer_integration = false,
  }
  for key, dir in pairs { h = 'left', j = 'down', k = 'up', l = 'right' } do
    vim.keymap.set('n', '<C-' .. key .. '>', splits['move_cursor_' .. dir], { desc = 'Focus window ' .. dir })
    vim.keymap.set('n', '<leader>w' .. key, splits['resize_' .. dir], { desc = 'Resize ' .. dir })
    vim.keymap.set('n', '<leader>ws' .. key, splits['swap_buf_' .. dir], { desc = 'Swap buffer ' .. dir })
  end
  vim.keymap.set('n', '<leader>w=', '<C-w>=', { desc = 'Equalize windows' })
  vim.keymap.set('n', '<leader>wr', function() require('which-key').show { keys = '<leader>w', loop = true } end, { desc = '[R]esize mode' })

  -- [[ Colorscheme ]]
  -- You can easily change to a different colorscheme.
  -- Change the name of the colorscheme plugin below, and then
  -- change the command under that to load whatever the name of that colorscheme is.
  --
  -- If you want to see what colorschemes are already installed, you can use `:Telescope colorscheme`.
  vim.pack.add { gh 'Ferouk/bearded-nvim' }

  local function tint(color, bg, alpha)
    local function ch(h, i) return tonumber(h:sub(i, i + 1), 16) end
    local out = {}
    for i = 2, 6, 2 do
      out[#out + 1] = string.format('%02x', math.floor(ch(color, i) * alpha + ch(bg, i) * (1 - alpha) + 0.5))
    end
    return '#' .. table.concat(out)
  end

  -- kitty applies background_opacity to every cell whose background equals the terminal
  -- default by value (kitty.conf, background_opacity), so with kitty on the same Bearded
  -- flavor the editor went translucent despite transparent = false. Moving the blue
  -- channel by 1/255 keeps nvim opaque and is invisible.
  local function opaque(bg)
    local b = tonumber(bg:sub(6, 7), 16)
    return bg:sub(1, 5) .. string.format('%02x', b == 255 and 254 or b + 1)
  end

  require('bearded').setup {
    flavor = 'hc-midnightvoid', -- see require('bearded').available_flavors()
    transparent = true, -- Set to true if you want a transparent background
    bold = true, -- Enable bold text
    italic = true, -- Enable italic text
    -- Runs on setup, :colorscheme bearded and :BeardedReload, so everything below
    -- follows the active flavor instead of being pinned to one palette.
    on_highlights = function(set, palette, opts)
      local c, ui, levels = palette.colors, palette.ui, palette.levels
      local bg = ui.uibackground
      if not opts.transparent then
        local solid = opaque(bg)
        set('Normal', { fg = ui.default, bg = solid })
        set('NormalNC', { fg = ui.default, bg = solid })
        set('WinSeparator', { fg = ui.border, bg = solid })
      end
      -- bearded ships neon Diff backgrounds (#2cfc82). render-markdown links H1Bg..H6Bg
      -- to those Diff groups, so both the diffs and the heading bands are retinted here.
      -- 0.10 is Bearded's own diffEditor.*Background alpha (0x1a); DiffText doubles it so
      -- changed text stays visible inside a DiffChange line.
      set('DiffAdd', { bg = tint(c.green, bg, 0.10) })
      set('DiffDelete', { bg = tint(c.red, bg, 0.10) })
      set('DiffChange', { bg = tint(c.blue, bg, 0.10) })
      set('DiffText', { bg = tint(c.blue, bg, 0.20) })
      -- Debugger. The stopped line used Visual (0.3 primary over bg), on which
      -- @punctuation (ui.defaultalt) measures 1.04:1 and vanishes. 0.10 yellow keeps
      -- it at 2.0:1 and matches VS Code's stackFrameHighlight hue. The dap-view panel
      -- takes the float/statusline background so it reads as chrome, not code.
      set('DapStoppedLine', { bg = tint(c.yellow, bg, 0.10) })
      -- `dim` emits SGR 2, which kitty renders at its `dim_opacity`; that is
      -- what makes the panel recede behind the code instead of competing with it.
      set('DapViewNormal', { fg = ui.defaultMain, bg = ui.uibackgroundalt, dim = true })
      set('NvimDapViewWatchExpr', { fg = c.blue })
      -- Neo-tree paints itself an opaque #151f27 while the code area is
      -- transparent, so the sidebar read as a second editor rather than as
      -- chrome. It takes the dap panel's background and dim instead.
      -- File icons are already coloured (mini.icons mocks nvim-web-devicons,
      -- init.lua below); directories were the one flat element left, at
      -- ui.primary, which in this flavor is the near-white #dbefff. Yellow
      -- because blue, green and orange are spoken for by the git status
      -- groups and would read as a state rather than as a folder.
      set('NeoTreeNormal', { fg = ui.defaultMain, bg = ui.uibackgroundalt, dim = true })
      set('NeoTreeNormalNC', { fg = ui.defaultMain, bg = ui.uibackgroundalt, dim = true })
      set('NeoTreeDirectoryIcon', { fg = c.yellow })
      set('NvimDapVirtualText', { link = 'DiagnosticVirtualTextInfo' })
      -- In transparent mode bearded resolves its `bg` to NONE, so every group
      -- built from it lost a colour: CursorLine painted nothing (neo-tree's,
      -- the quickfix's and the hover pane's cursor lines with it), and
      -- PmenuSel, Search and IncSearch kept the text's own light foreground
      -- on a light block. CursorLine takes the blend bearded uses when opaque.
      set('CursorLine', { bg = tint(ui.primary, bg, 0.06) })
      set('QuickFixLine', { bg = ui.primaryalt })
      set('PmenuSel', { fg = ui.uibackgroundalt, bg = ui.primary, bold = true })
      set('Search', { fg = ui.uibackgroundalt, bg = c.orange })
      set('IncSearch', { fg = ui.uibackgroundalt, bg = c.blue, bold = true })
      -- ui.border is a near-black that vanishes on the dimmed kitty background.
      set('WinSeparator', { fg = ui.primaryalt })
      -- With 'foldtext' empty a closed fold keeps its syntax colours; the band
      -- marks it as folded.
      set('Folded', { bg = ui.primaryalt })
      set('MatchParen', { fg = c.purple, bg = ui.primaryalt, bold = true })
      -- The active indent guide had the comment colour, same as the inactive ones.
      set('IblScope', { fg = ui.defaultMain })
      set('TreesitterContextBottom', { sp = ui.primaryalt, underline = true })
      for level, color in pairs { Error = levels.danger, Warn = levels.warning, Info = levels.info, Hint = c.purple } do
        set('DiagnosticUnderline' .. level, { sp = color, undercurl = true })
      end
      -- mini.statusline links the mode blocks to Cursor and the Diff groups,
      -- here a light block with no foreground and four faint backgrounds, and
      -- the file name to StatusLineNC, the comment colour. Dark text on the
      -- mode's accent, as VS Code's status bar does it.
      for mode, color in pairs { Normal = c.blue, Insert = c.green, Visual = c.purple, Replace = c.red, Command = c.orange, Other = c.pink } do
        set('MiniStatuslineMode' .. mode, { fg = ui.uibackgroundalt, bg = color, bold = true })
      end
      set('MiniStatuslineFilename', { fg = ui.default, bg = ui.uibackgroundalt })
      -- Per-level heading bands were already in this file (arc hex). Same six roles,
      -- now from the active flavor. Heading text in a plain buffer stays Bearded yellow
      -- (@markup.heading); render-markdown applies HnBg (priority 4096) on the line.
      for i, color in ipairs { c.blue, c.green, c.purple, c.yellow, c.orange, c.pink } do
        set('RenderMarkdownH' .. i .. 'Bg', { fg = color, bg = tint(color, bg, 0.10) })
      end
      -- @markup.raw stays Bearded purple (VS Code markup.inline.raw / fenced_code.block).
      -- @markup.bold is a stale capture; modern treesitter uses @markup.strong.
      set('@markup.strong', { fg = c.salmon, bold = true })
      set('@markup.strikethrough', { fg = c.red, strikethrough = true }) -- VS Code markup.strikethrough
      set('RenderMarkdownCode', { bg = ui.uibackgroundalt })
      set('RenderMarkdownCodeInline', { bg = ui.primaryalt })
      set('RenderMarkdownBullet', { fg = c.blue })
      set('RenderMarkdownDash', { fg = ui.defaultalt })
    end,
  }

  vim.cmd.colorscheme 'bearded'

  -- Highlight todo, notes, etc in comments
  vim.pack.add { gh 'folke/todo-comments.nvim' }
  require('todo-comments').setup { signs = false }

  vim.pack.add { gh 'MeanderingProgrammer/render-markdown.nvim' }

  vim.api.nvim_create_autocmd('FileType', {
    pattern = 'markdown',
    callback = function() vim.opt_local.conceallevel = 2 end,
  })

  require('render-markdown').setup {
    -- pipe_table = { enabled = true, render_modes = { 'i' } },
    pipe_table = { enabled = false },
    -- No latex parser is installed; checkhealth warned on every run.
    latex = { enabled = false },
  }
  vim.pack.add { gh 'ice345/markdown-table-wrap.nvim' }
  require('markdown-table-wrap').setup {
    preview_mode = 'inline',
    inline_mode = 'replace',
    inline_wrap_scope = 'always',
    inline_disable_wrap = true,
    row_separator = false,
  }
  -- [[ mini.nvim ]]
  --  A collection of various small independent plugins/modules
  vim.pack.add { gh 'nvim-mini/mini.nvim' }

  -- If a nerd font is available, load the icons module for pretty icons in various plugins.
  if vim.g.have_nerd_font then
    require('mini.icons').setup()
    -- Used for backwards compatibility with plugins that require `nvim-web-devicons` (e.g. telescope.nvim)
    MiniIcons.mock_nvim_web_devicons()
  end

  -- Better Around/Inside textobjects
  --
  -- Examples:
  --  - va)  - [V]isually select [A]round [)]paren
  --  - yiiq - [Y]ank [I]nside [I]+1 [Q]uote
  --  - ci'  - [C]hange [I]nside [']quote
  require('mini.ai').setup {
    -- nvim 0.12 added built-in v_an/v_in for treesitter node selection, which
    -- conflicts with mini.ai's around_next/inside_next defaults. Remapped here
    -- to avoid the collision. See kickstart.nvim #1971.
    -- aa/ii may shadow mini.ai custom textobjects (around-argument, inside-indent)
    -- if you add those later — pick different keys at that point.
    mappings = {
      around_next = 'aa',
      inside_next = 'ii',
    },
    n_lines = 500,
  }

  -- Add/delete/replace surroundings (brackets, quotes, etc.)
  --
  -- - saiw) - [S]urround [A]dd [I]nner [W]ord [)]Paren
  -- - sd'   - [S]urround [D]elete [']quotes
  -- - sr)'  - [S]urround [R]eplace [)] [']
  require('mini.surround').setup()

  -- Simple and easy statusline.
  --  You could remove this setup call if you don't like it,
  --  and try some other statusline plugin
  local statusline = require 'mini.statusline'
  -- Set `use_icons` to true if you have a Nerd Font
  statusline.setup { use_icons = vim.g.have_nerd_font }

  -- You can configure sections in the statusline by overriding their
  -- default behavior. For example, here we set the section for
  -- cursor location to LINE:COLUMN
  ---@diagnostic disable-next-line: duplicate-set-field
  statusline.section_location = function() return '%2l:%-2v %P' end

  -- `parent/file` instead of the full path: a hashed checkout directory pushed
  -- the name off the line. Special buffers (terminal, panels) keep their name.
  ---@diagnostic disable-next-line: duplicate-set-field
  statusline.section_filename = function()
    if vim.bo.buftype ~= '' then return '%t%( %M%)' end
    local name = vim.api.nvim_buf_get_name(0)
    if name == '' then return '[No Name]%( %M%)' end
    return vim.fn.fnamemodify(name, ':h:t') .. '/' .. vim.fn.fnamemodify(name, ':t') .. '%( %M%R%)'
  end

  -- Attached LSP client names, then the debugger's state (`Stopped at line
  -- 16`, `Running`) while a session exists. dap.status() keeps returning the
  -- last progress message after the session ends, hence the session guard.
  ---@diagnostic disable-next-line: duplicate-set-field
  statusline.section_lsp = function()
    local parts = {}
    for _, c in ipairs(vim.lsp.get_clients { bufnr = 0 }) do
      parts[#parts + 1] = c.name
    end
    local text = #parts > 0 and (' ' .. table.concat(parts, ' ')) or ''
    local dap = package.loaded.dap
    if dap and dap.session() then text = text .. '  ' .. dap.status():gsub('%%', '%%%%') end
    return text
  end
end

-- ============================================================
-- SECTION 5: SEARCH & NAVIGATION
-- Telescope setup, keymaps, LSP picker mappings
-- ============================================================
do
  -- [[ Fuzzy Finder (files, lsp, etc) ]]
  --
  -- Telescope is a fuzzy finder that comes with a lot of different things that
  -- it can fuzzy find! It's more than just a "file finder", it can search
  -- many different aspects of Neovim, your workspace, LSP, and more!
  --
  -- There are lots of other alternative pickers (like snacks.picker, or fzf-lua)
  -- so feel free to experiment and see what you like!
  --
  -- The easiest way to use Telescope, is to start by doing something like:
  --  :Telescope help_tags
  --
  -- After running this command, a window will open up and you're able to
  -- type in the prompt window. You'll see a list of `help_tags` options and
  -- a corresponding preview of the help.
  --
  -- Two important keymaps to use while in Telescope are:
  --  - Insert mode: <c-/>
  --  - Normal mode: ?
  --
  -- This opens a window that shows you all of the keymaps for the current
  -- Telescope picker. This is really useful to discover what Telescope can
  -- do as well as how to actually do it!

  ---@type (string|vim.pack.Spec)[]
  local telescope_plugins = {
    gh 'nvim-lua/plenary.nvim',
    gh 'nvim-telescope/telescope.nvim',
    gh 'nvim-telescope/telescope-ui-select.nvim',
  }
  if vim.fn.executable 'make' == 1 then table.insert(telescope_plugins, gh 'nvim-telescope/telescope-fzf-native.nvim') end

  -- NOTE: You can install multiple plugins at once
  vim.pack.add(telescope_plugins)

  -- See `:help telescope` and `:help telescope.setup()`
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
  -- Enable Telescope extensions if they are installed
  pcall(require('telescope').load_extension, 'fzf')
  pcall(require('telescope').load_extension, 'ui-select')

  -- See `:help telescope.builtin`
  local builtin = require 'telescope.builtin'
  vim.keymap.set('n', '<leader>sh', builtin.help_tags, { desc = '[S]earch [H]elp' })
  vim.keymap.set('n', '<leader>sk', builtin.keymaps, { desc = '[S]earch [K]eymaps' })
  vim.keymap.set('n', '<leader>sf', builtin.find_files, { desc = '[S]earch [F]iles' })
  vim.keymap.set('n', '<leader>ss', builtin.builtin, { desc = '[S]earch [S]elect Telescope' })
  vim.keymap.set({ 'n', 'v' }, '<leader>sw', builtin.grep_string, { desc = '[S]earch current [W]ord' })
  vim.keymap.set('n', '<leader>sg', builtin.live_grep, { desc = '[S]earch by [G]rep' })
  vim.keymap.set('n', '<leader>sd', builtin.diagnostics, { desc = '[S]earch [D]iagnostics' })
  vim.keymap.set('n', '<leader>sr', builtin.resume, { desc = '[S]earch [R]esume' })
  vim.keymap.set('n', '<leader>s.', builtin.oldfiles, { desc = '[S]earch Recent Files ("." for repeat)' })
  vim.keymap.set('n', '<leader>sc', builtin.commands, { desc = '[S]earch [C]ommands' })
  vim.keymap.set('n', '<leader><leader>', builtin.buffers, { desc = '[ ] Find existing buffers' })

  -- Add Telescope-based LSP pickers when an LSP attaches to a buffer.
  -- If you later switch picker plugins, this is where to update these mappings.
  vim.api.nvim_create_autocmd('LspAttach', {
    group = vim.api.nvim_create_augroup('telescope-lsp-attach', { clear = true }),
    callback = function(event)
      local buf = event.buf

      -- Find references for the word under your cursor.
      vim.keymap.set('n', 'grr', builtin.lsp_references, { buffer = buf, desc = '[G]oto [R]eferences' })

      -- Jump to the implementation of the word under your cursor.
      -- Useful when your language has ways of declaring types without an actual implementation.
      vim.keymap.set('n', 'gri', builtin.lsp_implementations, { buffer = buf, desc = '[G]oto [I]mplementation' })

      -- Jump to the definition of the word under your cursor.
      -- This is where a variable was first declared, or where a function is defined, etc.
      -- To jump back, press <C-t>.
      vim.keymap.set('n', 'grd', builtin.lsp_definitions, { buffer = buf, desc = '[G]oto [D]efinition' })

      -- Fuzzy find all the symbols in your current document.
      -- Symbols are things like variables, functions, types, etc.
      vim.keymap.set('n', 'gO', builtin.lsp_document_symbols, { buffer = buf, desc = 'Open Document Symbols' })

      -- Fuzzy find all the symbols in your current workspace.
      -- Similar to document symbols, except searches over your entire project.
      vim.keymap.set('n', 'gW', builtin.lsp_dynamic_workspace_symbols, { buffer = buf, desc = 'Open Workspace Symbols' })

      -- Jump to the type of the word under your cursor.
      -- Useful when you're not sure what type a variable is and you want to see
      -- the definition of its *type*, not where it was *defined*.
      vim.keymap.set('n', 'grt', builtin.lsp_type_definitions, { buffer = buf, desc = '[G]oto [T]ype Definition' })
    end,
  })

  -- Override default behavior and theme when searching
  vim.keymap.set('n', '<leader>/', function()
    -- You can pass additional configuration to Telescope to change the theme, layout, etc.
    builtin.current_buffer_fuzzy_find(require('telescope.themes').get_dropdown {
      winblend = 10,
      previewer = false,
    })
  end, { desc = '[/] Fuzzily search in current buffer' })

  -- It's also possible to pass additional configuration options.
  --  See `:help telescope.builtin.live_grep()` for information about particular keys
  vim.keymap.set(
    'n',
    '<leader>s/',
    function()
      builtin.live_grep {
        grep_open_files = true,
        prompt_title = 'Live Grep in Open Files',
      }
    end,
    { desc = '[S]earch [/] in Open Files' }
  )

  -- Shortcut for searching your Neovim configuration files
  vim.keymap.set('n', '<leader>sn', function() builtin.find_files { cwd = vim.fn.stdpath 'config', follow = true } end, { desc = '[S]earch [N]eovim files' })
end

-- ============================================================
-- SECTION 6: LSP
-- LSP keymaps, server configuration, Mason tools installations
-- ============================================================
do
  -- [[ LSP Configuration ]]
  -- Brief aside: **What is LSP?**
  --
  -- LSP is an initialism you've probably heard, but might not understand what it is.
  --
  -- LSP stands for Language Server Protocol. It's a protocol that helps editors
  -- and language tooling communicate in a standardized fashion.
  --
  -- In general, you have a "server" which is some tool built to understand a particular
  -- language (such as `gopls`, `lua_ls`, `rust_analyzer`, etc.). These Language Servers
  -- (sometimes called LSP servers, but that's kind of like ATM Machine) are standalone
  -- processes that communicate with some "client" - in this case, Neovim!
  --
  -- LSP provides Neovim with features like:
  --  - Go to definition
  --  - Find references
  --  - Autocompletion
  --  - Symbol Search
  --  - and more!
  --
  -- Thus, Language Servers are external tools that must be installed separately from
  -- Neovim. This is where `mason` and related plugins come into play.
  --
  -- If you're wondering about lsp vs treesitter, you can check out the wonderfully
  -- and elegantly composed help section, `:help lsp-vs-treesitter`

  -- Useful status updates for LSP.
  vim.pack.add { gh 'j-hui/fidget.nvim' }
  require('fidget').setup {}

  --  This function gets run when an LSP attaches to a particular buffer.
  --    That is to say, every time a new file is opened that is associated with
  --    an lsp (for example, opening `main.rs` is associated with `rust_analyzer`) this
  --    function will be executed to configure the current buffer
  vim.api.nvim_create_autocmd('LspAttach', {
    group = vim.api.nvim_create_augroup('kickstart-lsp-attach', { clear = true }),
    callback = function(event)
      -- NOTE: Remember that Lua is a real programming language, and as such it is possible
      -- to define small helper and utility functions so you don't have to repeat yourself.
      --
      -- In this case, we create a function that lets us more easily define mappings specific
      -- for LSP related items. It sets the mode, buffer and description for us each time.
      local map = function(keys, func, desc, mode)
        mode = mode or 'n'
        vim.keymap.set(mode, keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
      end

      -- Rename the variable under your cursor.
      --  Most Language Servers support renaming across files, etc.
      map('grn', vim.lsp.buf.rename, '[R]e[n]ame')

      -- Execute a code action, usually your cursor needs to be on top of an error
      -- or a suggestion from your LSP for this to activate.
      map('gra', vim.lsp.buf.code_action, '[G]oto Code [A]ction', { 'n', 'x' })

      -- WARN: This is not Goto Definition, this is Goto Declaration.
      --  For example, in C this would take you to the header.
      map('grD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')

      -- The following two autocommands are used to highlight references of the
      -- word under your cursor when your cursor rests there for a little while.
      --    See `:help CursorHold` for information about when this is executed
      --
      -- When you move your cursor, the highlights will be cleared (the second autocommand).
      local client = vim.lsp.get_client_by_id(event.data.client_id)
      if client and client:supports_method('textDocument/documentHighlight', event.buf) then
        local highlight_augroup = vim.api.nvim_create_augroup('kickstart-lsp-highlight', { clear = false })
        vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
          buffer = event.buf,
          group = highlight_augroup,
          callback = vim.lsp.buf.document_highlight,
        })

        vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
          buffer = event.buf,
          group = highlight_augroup,
          callback = vim.lsp.buf.clear_references,
        })

        vim.api.nvim_create_autocmd('LspDetach', {
          group = vim.api.nvim_create_augroup('kickstart-lsp-detach', { clear = true }),
          callback = function(event2)
            vim.lsp.buf.clear_references()
            vim.api.nvim_clear_autocmds { group = 'kickstart-lsp-highlight', buffer = event2.buf }
          end,
        })
      end

      -- Inlay hints on, as in VS Code; vtsls is trimmed to parameter names
      -- below so they stay sparse. <leader>th is the off-switch.
      if client and client:supports_method('textDocument/inlayHint', event.buf) then
        vim.lsp.inlay_hint.enable(true, { bufnr = event.buf })
        map('<leader>th', function() vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled { bufnr = event.buf }) end, '[T]oggle Inlay [H]ints')
      end

      -- Colour swatches on colour literals (cssls) and paired JSX/HTML tag
      -- renames (vtsls), both new in 0.12 and only for servers that offer them.
      if client and client:supports_method('textDocument/documentColor', event.buf) then
        vim.lsp.document_color.enable(true, { bufnr = event.buf, client_id = client.id })
      end
      if client and client:supports_method('textDocument/linkedEditingRange', event.buf) then
        vim.lsp.linked_editing_range.enable(true, { client_id = client.id })
      end

      -- K shows the variable's value while stopped in the debugger (VS Code's
      -- debug hover), and the LSP hover otherwise.
      map('K', function()
        local dap = package.loaded.dap
        if dap and dap.session() then return require('dap-view').hover(nil, true) end
        vim.lsp.buf.hover()
      end, 'Hover (debug value while stopped)')
    end,
  })

  -- Enable the following language servers
  --  Feel free to add/remove any LSPs that you want here. They will automatically be installed.
  --  See `:help lsp-config` for information about keys and how to configure
  ---@type table<string, vim.lsp.Config>
  local servers = {
    vtsls = {
      -- Parameter names on literal arguments only, which is what VS Code shows
      -- by default; the type hints on every declaration and return doubled
      -- the width of a line.
      settings = {
        typescript = {
          inlayHints = {
            parameterNames = { enabled = 'literals', suppressWhenArgumentMatchesName = true },
          },
        },
        javascript = {
          inlayHints = {
            parameterNames = { enabled = 'literals', suppressWhenArgumentMatchesName = true },
          },
        },
      },
    },

    pyright = {},

    eslint = {
      root_markers = {
        '.eslintrc',
        '.eslintrc.js',
        '.eslintrc.json',
        '.eslintrc.yml',
        '.eslintrc.yaml',
        'eslint.config.js',
        'eslint.config.mjs',
        'eslint.config.cjs',
        'eslint.config.ts',
        'eslint.config.mts',
      },
    },

    markdown_oxide = {
      root_markers = { '.obsidian', '.moxide.toml', '.git' },
    },

    jsonls = {},
    yamlls = {},
    bashls = {},

    lua_ls = {
      on_init = function(client)
        client.server_capabilities.documentFormattingProvider = false -- Disable formatting (formatting is done by stylua)

        if client.workspace_folders then
          local path = client.workspace_folders[1].name
          if path ~= vim.fn.stdpath 'config' and (vim.uv.fs_stat(path .. '/.luarc.json') or vim.uv.fs_stat(path .. '/.luarc.jsonc')) then return end
        end

        client.config.settings.Lua = vim.tbl_deep_extend('force', client.config.settings.Lua, {
          runtime = {
            version = 'LuaJIT',
            path = { 'lua/?.lua', 'lua/?/init.lua' },
          },
          workspace = {
            checkThirdParty = false,
            -- NOTE: this is a lot slower and will cause issues when working on your own configuration.
            --  See https://github.com/neovim/nvim-lspconfig/issues/3189
            library = vim.tbl_extend('force', vim.api.nvim_get_runtime_file('', true), {
              '${3rd}/luv/library',
              '${3rd}/busted/library',
            }),
          },
        })
      end,
      ---@type lspconfig.settings.lua_ls
      settings = {
        Lua = {
          format = { enable = false }, -- Disable formatting (formatting is done by stylua)
        },
      },
    },
  }

  vim.pack.add {
    gh 'neovim/nvim-lspconfig',
    gh 'mason-org/mason.nvim',
    gh 'mason-org/mason-lspconfig.nvim',
    gh 'WhoIsSethDaniel/mason-tool-installer.nvim',
    gh 'b0o/SchemaStore.nvim',
  }

  -- Automatically install LSPs and related tools to stdpath for Neovim
  require('mason').setup {}

  -- Ensure the servers and tools above are installed
  --
  -- To check the current status of installed tools and/or manually install
  -- other tools, you can run
  --    :Mason
  --
  -- You can press `g?` for help in this menu.
  local ensure_installed = vim.tbl_keys(servers or {})
  vim.list_extend(ensure_installed, {
    'stylua',
    'prettierd',
    'ruff',
    'shfmt',
    'shellcheck',
    'markdownlint',
    'markdown-oxide',
  })

  require('mason-tool-installer').setup { ensure_installed = ensure_installed }

  -- Wire SchemaStore schemas into jsonls/yamlls (must be after vim.pack.add loads the plugin)
  servers.jsonls.settings = {
    json = {
      schemas = require('schemastore').json.schemas(),
      validate = { enable = true },
    },
  }
  servers.yamlls.settings = {
    yaml = {
      schemaStore = { enable = false, url = '' },
      schemas = require('schemastore').yaml.schemas(),
    },
  }

  for name, server in pairs(servers) do
    vim.lsp.config(name, server)
    vim.lsp.enable(name)
  end
end

-- ============================================================
-- SECTION 7: FORMATTING
-- conform.nvim setup and keymap
-- ============================================================
do
  -- [[ Formatting ]]
  vim.pack.add { gh 'stevearc/conform.nvim' }
  require('conform').setup {
    notify_on_error = false,
    format_on_save = function(bufnr)
      local disabled_filetypes = { c = true, cpp = true, markdown = true }
      if disabled_filetypes[vim.bo[bufnr].filetype] then return nil end
      return { timeout_ms = 1000, lsp_format = 'fallback' }
    end,
    default_format_opts = {
      lsp_format = 'fallback',
    },
    formatters_by_ft = {
      javascript = { 'prettierd' },
      javascriptreact = { 'prettierd' },
      typescript = { 'prettierd' },
      typescriptreact = { 'prettierd' },
      json = { 'prettierd' },
      jsonc = { 'prettierd' },
      html = { 'prettierd' },
      css = { 'prettierd' },
      scss = { 'prettierd' },
      yaml = { 'prettierd' },
      markdown = { 'prettierd' },
      python = { 'ruff_organize_imports', 'ruff_format' },
      lua = { 'stylua' },
      sh = { 'shfmt' },
      bash = { 'shfmt' },
    },
    formatters = {
      shfmt = { prepend_args = { '-i', '2' } },
    },
  }

  vim.keymap.set({ 'n', 'v' }, '<leader>f', function() require('conform').format { async = true } end, { desc = '[F]ormat buffer' })
end

-- ============================================================
-- SECTION 8: AUTOCOMPLETE
-- blink.cmp setup
-- ============================================================
do
  -- LuaSnip removed: blink.cmp handles LSP snippet expansion natively.
  -- To restore custom snippets, uncomment and add snippet files:
  -- vim.pack.add { { src = gh 'L3MON4D3/LuaSnip', version = vim.version.range '2.*' } }
  -- require('luasnip').setup {}
  -- vim.pack.add { gh 'rafamadriz/friendly-snippets' }
  -- require('luasnip.loaders.from_vscode').lazy_load()
  -- Then set snippets = { preset = 'luasnip' } in blink.cmp below.

  -- [[ Autocomplete Engine ]]
  vim.pack.add { { src = gh 'saghen/blink.cmp', version = vim.version.range '1.*' } }
  require('blink.cmp').setup {
    keymap = {
      -- 'default' (recommended) for mappings similar to built-in completions
      --   <c-y> to accept ([y]es) the completion.
      --    This will auto-import if your LSP supports it.
      --    This will expand snippets if the LSP sent a snippet.
      -- 'super-tab' for tab to accept
      -- 'enter' for enter to accept
      -- 'none' for no mappings
      --
      -- For an understanding of why the 'default' preset is recommended,
      -- you will need to read `:help ins-completion`
      --
      -- No, but seriously. Please read `:help ins-completion`, it is really good!
      --
      -- All presets have the following mappings:
      -- <tab>/<s-tab>: move to right/left of your snippet expansion
      -- <c-space>: Open menu or open docs if already open
      -- <c-n>/<c-p> or <up>/<down>: Select next/previous item
      -- <c-e>: Hide menu
      -- <c-k>: Toggle signature help
      --
      -- See `:help blink-cmp-config-keymap` for defining your own keymap
      preset = 'default',

      -- For more advanced Luasnip keymaps (e.g. selecting choice nodes, expansion) see:
      --    https://github.com/L3MON4D3/LuaSnip?tab=readme-ov-file#keymaps
    },

    appearance = {
      -- 'mono' (default) for 'Nerd Font Mono' or 'normal' for 'Nerd Font'
      -- Adjusts spacing to ensure icons are aligned
      nerd_font_variant = 'mono',
    },

    completion = {
      -- By default, you may press `<c-space>` to show the documentation.
      -- Optionally, set `auto_show = true` to show the documentation after a delay.
      documentation = { auto_show = true, auto_show_delay_ms = 500 },
    },

    sources = {
      default = { 'lsp', 'path', 'snippets' },
    },

    snippets = { preset = 'default' },

    -- Blink.cmp includes an optional, recommended rust fuzzy matcher,
    -- which automatically downloads a prebuilt binary when enabled.
    --
    -- By default, we use the Lua implementation instead, but you may enable
    -- the rust implementation via `'prefer_rust_with_warning'`
    --
    -- See `:help blink-cmp-config-fuzzy` for more information
    fuzzy = { implementation = 'prefer_rust_with_warning' },

    -- Shows a signature help window while you type arguments for a function
    signature = { enabled = true },

    cmdline = {
      enabled = true,
      sources = function()
        local type = vim.fn.getcmdtype()
        if type == '/' or type == '?' then return { 'buffer' } end
        if type == ':' then return { 'cmdline' } end
        return {}
      end,
    },
  }
end

-- ============================================================
-- SECTION 9: TREESITTER
-- Parser installation, syntax highlighting, folds, indentation
-- ============================================================
do
  -- [[ Configure Treesitter ]]
  --  Used to highlight, edit, and navigate code
  --
  --  See `:help nvim-treesitter-intro`

  -- NOTE: You can also specify a branch or a specific commit
  vim.pack.add { { src = gh 'nvim-treesitter/nvim-treesitter', version = 'main' } }

  -- Ensure basic parsers are installed
  local parsers =
    { 'diff', 'javascript', 'json', 'lua', 'luadoc', 'markdown', 'markdown_inline', 'python', 'query', 'tsx', 'typescript', 'vim', 'vimdoc', 'yaml' }
  require('nvim-treesitter').install(parsers)

  ---@param buf integer
  ---@param language string
  local function treesitter_try_attach(buf, language)
    -- Check if a parser exists and load it
    if not vim.treesitter.language.add(language) then return end
    -- Enable syntax highlighting and other treesitter features
    vim.treesitter.start(buf, language)

    -- Enable treesitter based folds
    -- For more info on folds see `:help folds`
    vim.wo.foldexpr = 'v:lua.vim.treesitter.foldexpr()'
    vim.wo.foldmethod = 'expr'

    -- Check if treesitter indentation is available for this language, and if so enable it
    -- in case there is no indent query, the indentexpr will fallback to the vim's built in one
    local has_indent_query = vim.treesitter.query.get(language, 'indents') ~= nil

    -- Enable treesitter based indentation
    if has_indent_query then vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()" end
  end

  local available_parsers = require('nvim-treesitter').get_available()
  vim.api.nvim_create_autocmd('FileType', {
    callback = function(args)
      local buf, filetype = args.buf, args.match

      local language = vim.treesitter.language.get_lang(filetype)
      if not language then return end

      local installed_parsers = require('nvim-treesitter').get_installed 'parsers'

      if vim.tbl_contains(installed_parsers, language) then
        -- Enable the parser if it is already installed
        treesitter_try_attach(buf, language)
      elseif vim.tbl_contains(available_parsers, language) then
        -- If a parser is available in `nvim-treesitter`, auto-install it and enable it after the installation is done
        require('nvim-treesitter').install(language):await(function() treesitter_try_attach(buf, language) end)
      else
        -- Try to enable treesitter features in case the parser exists but is not available from `nvim-treesitter`
        treesitter_try_attach(buf, language)
      end
    end,
  })

  -- Sticky scroll: the enclosing class and function signatures stay pinned
  -- above the viewport, as in VS Code. Bearded ships the highlight groups.
  vim.pack.add { gh 'nvim-treesitter/nvim-treesitter-context' }
  require('treesitter-context').setup {
    max_lines = 4,
    multiline_threshold = 1,
    trim_scope = 'inner',
  }
end

-- ============================================================
-- SECTION 10: PLUGIN MODULES
-- lua/kickstart/plugins/*: debugger, indent guides, lint, autopairs, neo-tree, gitsigns
-- ============================================================
do
  require 'kickstart.plugins.debug'
  require 'kickstart.plugins.indent_line'
  require 'kickstart.plugins.lint'
  require 'kickstart.plugins.autopairs'
  require 'kickstart.plugins.neo-tree'
  require 'kickstart.plugins.gitsigns' -- adds gitsigns recommended keymaps
end

-- The line beneath this is called `modeline`. See `:help modeline`
-- vim: ts=2 sts=2 sw=2 et

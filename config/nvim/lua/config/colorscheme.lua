-- The theme, and todo-comments, which only paints comment keywords with it.

vim.pack.add { 'https://github.com/Ferouk/bearded-nvim' }

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
  transparent = true,
  bold = true,
  italic = true,
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

vim.pack.add { 'https://github.com/folke/todo-comments.nvim' }
require('todo-comments').setup { signs = false }

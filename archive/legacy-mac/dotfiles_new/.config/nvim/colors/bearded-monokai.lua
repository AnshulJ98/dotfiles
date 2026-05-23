-- Bearded Theme Monokai Black Pro Filter for Neovim
-- A faithful port of the "Bearded Theme Monokai Black Pro Filter" VSCode theme.
-- Every color value is taken directly from the VSCode theme JSON.

vim.cmd("hi clear")
if vim.fn.exists("syntax_on") then
  vim.cmd("syntax reset")
end

vim.g.colors_name = "bearded-monokai"
vim.o.termguicolors = true

-- ---------------------------------------------------------------------------
-- Palette
-- ---------------------------------------------------------------------------
local c = {
  -- Backgrounds
  bg = "#141414",
  bg_dark = "#0e0e0e",
  bg_darker = "#060606",
  bg_darkest = "#050505",
  bg_panel = "#111111",
  bg_float = "#212121",
  bg_popup = "#191919",
  bg_popup_sel = "#2e2e2e",
  bg_input = "#1a1a1a",
  bg_quick = "#1c1c1c",

  -- Foregrounds
  fg = "#c7c7c7",
  fg_dim = "#adadad",
  fg_dimmer = "#919191",
  fg_dark = "#8f8f8f",
  fg_muted = "#545454",
  fg_desc = "#c7c7c780", -- with alpha, we approximate below

  -- Borders
  border = "#050505",
  border_input = "#3a3a3a",
  border_focus = "#474747",

  -- Accents
  yellow = "#ffee00",
  red = "#ff5555",
  green = "#66ff88",
  cyan = "#44ddff",
  magenta = "#ff44ff",
  orange = "#ff8844",
  pink = "#ff3377",
  teal = "#44ffcc",
  purple = "#cc88ff",
  lime = "#88ff44",

  -- Bright terminal variants
  bright_red = "#ff3333",
  bright_green = "#88ff44",
  bright_blue = "#00eeff",
  bright_cyan = "#00ffcc",
  bright_white = "#fafafa",
  bright_black = "#444444",

  -- UI special
  cursor = "#ffee00",
  selection = "#8f8f8f4d",
  line_hl_bg = "#8f8f8f0f",
  line_hl_border = "#8f8f8f26",
  indent = "#54545433",
  indent_active = "#545454cc",
  list_sel = "#3b3b3b73",
  list_hover = "#3b3b3b4d",
  search_bg = "#8f8f8f30",
  search_border = "#8f8f8f61",
  search_hl = "#8f8f8f3d",
  diff_add_bg = "#66ff881a",
  diff_del_bg = "#ff55551a",
  tab_active_top = "#8f8f8f",

  -- Diagnostics
  error = "#ff5555",
  warning = "#ffee00",
  info = "#44ddff",
  hint = "#44ddff",

  none = "NONE",
}

-- Approximate alpha-blended colors against #141414 bg for highlight groups
-- that do not support alpha in terminal Neovim.
local c_blend = {
  selection = "#4a4a4a", -- #8f8f8f at 30% on #141414
  line_hl = "#161616", -- #8f8f8f at 6% on #141414
  line_hl_border = "#1d1d1d", -- #8f8f8f at 15% on #141414
  indent = "#222222", -- #545454 at 20% on #141414
  indent_active = "#484848", -- #545454 at 80% on #141414
  list_sel = "#2a2a2a", -- #3b3b3b at 45% on #141414
  list_hover = "#272727", -- #3b3b3b at 30% on #141414
  search_bg = "#2e2e2e", -- #8f8f8f at 19% on #141414
  search_hl = "#323232", -- #8f8f8f at 24% on #141414
  diff_add_bg = "#1b1e1b", -- #66ff88 at 10% on #141414
  diff_del_bg = "#1f1516", -- #ff5555 at 10% on #141414
  fg_desc = "#9a9a9a", -- #c7c7c7 at 50% on dark
  statusbar_fg = "#8a8a8a", -- #adadad at 50% approx
  diag_vt_error = "#2a1818", -- subtle error bg
  diag_vt_warn = "#2a2814", -- subtle warn bg
  diag_vt_info = "#182228", -- subtle info bg
  diag_vt_hint = "#182228", -- subtle hint bg
}

-- ---------------------------------------------------------------------------
-- Transparency support
-- ---------------------------------------------------------------------------
local transparent = vim.g.bearded_transparent or false

local bg_normal = transparent and c.none or c.bg
local bg_sidebar = true and c.none or c.bg_dark
local bg_float_actual = c.bg_float -- floats keep bg even if transparent
local bg_statusline = transparent and c.none or c.bg

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
local function hi(group, opts)
  vim.api.nvim_set_hl(0, group, opts)
end

-- ---------------------------------------------------------------------------
-- Standard Vim highlight groups
-- ---------------------------------------------------------------------------

-- Core editor
hi("Normal", { fg = c.fg, bg = bg_normal })
hi("NormalNC", { fg = c.fg, bg = bg_normal })
hi("NormalFloat", { fg = c.fg, bg = bg_float_actual })
hi("FloatBorder", { fg = c.border_focus, bg = bg_float_actual })
hi("FloatTitle", { fg = c.yellow, bg = bg_float_actual, bold = true })
hi("Cursor", { fg = c.bg, bg = c.cursor })
hi("lCursor", { link = "Cursor" })
hi("CursorIM", { link = "Cursor" })
hi("TermCursor", { fg = c.bg, bg = c.cursor })
hi("TermCursorNC", { fg = c.bg, bg = c.fg_muted })

-- Cursor line / column
hi("CursorLine", { bg = c_blend.line_hl })
hi("CursorColumn", { bg = c_blend.line_hl })
hi("ColorColumn", { bg = c_blend.line_hl })

-- Line numbers
hi("LineNr", { fg = "#383e3a" })
hi("CursorLineNr", { fg = c.fg_dimmer, bold = true })
hi("SignColumn", { fg = c.fg_muted, bg = bg_normal })
hi("FoldColumn", { fg = c.fg_muted, bg = bg_normal })

-- Splits and separators
hi("VertSplit", { fg = c.border })
hi("WinSeparator", { fg = c.border })

-- Status line
hi("StatusLine", { fg = c_blend.statusbar_fg, bg = bg_statusline })
hi("StatusLineNC", { fg = c.fg_muted, bg = bg_sidebar })

-- Tab line
hi("TabLine", { fg = c.fg_muted, bg = c.bg_dark })
hi("TabLineFill", { bg = c.bg_dark })
hi("TabLineSel", { fg = c.fg, bg = c.bg, bold = true })

-- Popup menu (completion)
hi("Pmenu", { fg = c.fg, bg = c.bg_popup })
hi("PmenuSel", { fg = c.fg, bg = c.bg_popup_sel })
hi("PmenuSbar", { bg = "#2a2a2a" })
hi("PmenuThumb", { bg = c.fg_muted })
hi("PmenuKind", { fg = c.yellow, bg = c.bg_popup })
hi("PmenuKindSel", { fg = c.yellow, bg = c.bg_popup_sel })

-- Visual / Selection
hi("Visual", { bg = c_blend.selection })
hi("VisualNOS", { bg = c_blend.selection })

-- Search
hi("Search", { fg = c.none, bg = c_blend.search_bg })
hi("IncSearch", { fg = c.bg, bg = c.yellow })
hi("CurSearch", { fg = c.bg, bg = c.yellow, bold = true })
hi("Substitute", { fg = c.bg, bg = c.orange })

-- Matching
hi("MatchParen", { fg = c.yellow, bg = "#3a3a3a", bold = true })

-- Invisible / special characters
hi("NonText", { fg = "#2a2a2a" })
hi("SpecialKey", { fg = "#2a2a2a" })
hi("Whitespace", { fg = "#2a2a2a" })
hi("EndOfBuffer", { fg = c.bg })

-- Folded
hi("Folded", { fg = c.fg_muted, bg = "#1e1e1e", italic = true })

-- Messages
hi("Title", { fg = c.yellow, bold = true })
hi("Directory", { fg = c.cyan })
hi("Question", { fg = c.cyan })
hi("MoreMsg", { fg = c.green })
hi("WarningMsg", { fg = c.warning })
hi("ErrorMsg", { fg = c.error, bold = true })
hi("ModeMsg", { fg = c.fg_dim })
hi("MsgArea", { fg = c.fg_dim })

-- Diff
hi("DiffAdd", { bg = c_blend.diff_add_bg })
hi("DiffChange", { bg = "#1a2028" })
hi("DiffDelete", { bg = c_blend.diff_del_bg })
hi("DiffText", { bg = "#2a3844", bold = true })

-- Spell
hi("SpellBad", { sp = c.error, undercurl = true })
hi("SpellCap", { sp = c.warning, undercurl = true })
hi("SpellLocal", { sp = c.info, undercurl = true })
hi("SpellRare", { sp = c.purple, undercurl = true })

-- Misc
hi("WildMenu", { fg = c.bg, bg = c.yellow })
hi("Conceal", { fg = c.fg_muted })
hi("WinBar", { fg = c.fg_dim, bg = bg_normal, bold = true })
hi("WinBarNC", { fg = c.fg_muted, bg = bg_sidebar })

-- Quick-fix
hi("qfLineNr", { fg = c.yellow })
hi("qfFileName", { fg = c.cyan })

-- ---------------------------------------------------------------------------
-- Syntax highlight groups
-- ---------------------------------------------------------------------------

-- Comments
hi("Comment", { fg = c.fg_muted, italic = true })

-- Constants
hi("Constant", { fg = c.red })
hi("String", { fg = c.green })
hi("Character", { fg = c.green })
hi("Number", { fg = c.red })
hi("Boolean", { fg = c.red })
hi("Float", { fg = c.red })

-- Identifiers
hi("Identifier", { fg = c.pink })
hi("Function", { fg = c.cyan })

-- Statements
hi("Statement", { fg = c.yellow })
hi("Conditional", { fg = c.yellow })
hi("Repeat", { fg = c.yellow })
hi("Label", { fg = c.yellow })
hi("Operator", { fg = c.fg_dim })
hi("Keyword", { fg = c.yellow })
hi("Exception", { fg = c.yellow })

-- Preprocessor
hi("PreProc", { fg = c.yellow })
hi("Include", { fg = c.yellow })
hi("Define", { fg = c.yellow })
hi("Macro", { fg = c.yellow })
hi("PreCondit", { fg = c.yellow })

-- Types
hi("Type", { fg = c.lime })
hi("StorageClass", { fg = c.yellow })
hi("Structure", { fg = c.lime })
hi("Typedef", { fg = c.lime })

-- Special
hi("Special", { fg = c.orange })
hi("SpecialChar", { fg = c.red })
hi("Tag", { fg = c.red })
hi("Delimiter", { fg = c.fg_dim })
hi("SpecialComment", { fg = c.fg_muted, bold = true })
hi("Debug", { fg = c.orange })

-- Misc syntax
hi("Underlined", { fg = c.cyan, underline = true })
hi("Ignore", { fg = c.fg_muted })
hi("Error", { fg = c.error, bold = true })
hi("Todo", { fg = c.yellow, bg = "#2a2814", bold = true })
hi("Added", { fg = c.green })
hi("Changed", { fg = c.cyan })
hi("Removed", { fg = c.red })

-- ---------------------------------------------------------------------------
-- Treesitter highlight groups
-- ---------------------------------------------------------------------------

-- Comments
hi("@comment", { link = "Comment" })

-- Strings
hi("@string", { fg = c.green })
hi("@string.escape", { fg = c.red })
hi("@string.regex", { fg = c.green })
hi("@string.special", { fg = c.orange })

-- Numbers / Booleans
hi("@number", { fg = c.red })
hi("@boolean", { fg = c.red })
hi("@float", { fg = c.red })

-- Functions
hi("@function", { fg = c.cyan })
hi("@function.builtin", { fg = c.cyan })
hi("@function.call", { fg = c.cyan })
hi("@function.method", { fg = c.cyan })
hi("@function.method.call", { fg = c.cyan })
hi("@method", { fg = c.cyan })
hi("@method.call", { fg = c.cyan })

-- Keywords
hi("@keyword", { fg = c.yellow })
hi("@keyword.function", { fg = c.yellow })
hi("@keyword.return", { fg = c.yellow })
hi("@keyword.import", { fg = c.yellow })
hi("@keyword.export", { fg = c.yellow })
hi("@keyword.operator", { fg = c.yellow })
hi("@keyword.coroutine", { fg = c.yellow })
hi("@keyword.exception", { fg = c.yellow })
hi("@keyword.conditional", { fg = c.yellow })
hi("@keyword.repeat", { fg = c.yellow })
hi("@keyword.storage", { fg = c.yellow })
hi("@keyword.directive", { fg = c.yellow })
hi("@keyword.modifier", { fg = c.yellow })

-- Control flow
hi("@conditional", { fg = c.yellow })
hi("@repeat", { fg = c.yellow })
hi("@exception", { fg = c.yellow })

-- Operators / Punctuation
hi("@operator", { fg = c.fg_dim })
hi("@punctuation.bracket", { fg = c.fg_dim })
hi("@punctuation.delimiter", { fg = c.fg_dim })
hi("@punctuation.special", { fg = c.fg_dim })

-- Variables
hi("@variable", { fg = c.pink })
hi("@variable.builtin", { fg = c.teal })
hi("@variable.member", { fg = c.orange })
hi("@variable.parameter", { fg = c.magenta })

-- Parameters
hi("@parameter", { fg = c.magenta })

-- Types
hi("@type", { fg = c.lime })
hi("@type.builtin", { fg = c.lime })
hi("@type.definition", { fg = c.lime })
hi("@type.qualifier", { fg = c.yellow })

-- Constructor
hi("@constructor", { fg = c.purple })

-- Properties / Fields
hi("@property", { fg = c.orange })
hi("@field", { fg = c.orange })

-- Namespace / Module
hi("@namespace", { fg = c.cyan })
hi("@module", { fg = c.cyan })

-- Include
hi("@include", { fg = c.yellow })

-- Constants
hi("@constant", { fg = c.red })
hi("@constant.builtin", { fg = c.red })
hi("@constant.macro", { fg = c.red })

-- Characters
hi("@character", { fg = c.green })
hi("@character.special", { fg = c.red })

-- Tags (HTML/JSX)
hi("@tag", { fg = c.red })
hi("@tag.attribute", { fg = c.yellow })
hi("@tag.delimiter", { fg = c.fg_dim })
hi("@tag.builtin", { fg = c.red })

-- Attributes / Labels
hi("@attribute", { fg = c.magenta })
hi("@label", { fg = c.yellow })

-- Markup
hi("@markup.heading", { fg = c.cyan, bold = true })
hi("@markup.heading.1", { fg = c.cyan, bold = true })
hi("@markup.heading.2", { fg = c.cyan, bold = true })
hi("@markup.heading.3", { fg = c.cyan, bold = true })
hi("@markup.heading.4", { fg = c.cyan, bold = true })
hi("@markup.heading.5", { fg = c.cyan, bold = true })
hi("@markup.heading.6", { fg = c.cyan, bold = true })
hi("@markup.bold", { bold = true })
hi("@markup.italic", { italic = true })
hi("@markup.strikethrough", { strikethrough = true })
hi("@markup.underline", { underline = true })
hi("@markup.link", { fg = c.cyan, underline = true })
hi("@markup.link.url", { fg = c.cyan, underline = true })
hi("@markup.link.label", { fg = c.cyan })
hi("@markup.raw", { fg = c.green })
hi("@markup.raw.block", { fg = c.green })
hi("@markup.list", { fg = c.fg_dim })
hi("@markup.list.checked", { fg = c.green })
hi("@markup.list.unchecked", { fg = c.fg_muted })
hi("@markup.quote", { fg = c.fg_muted, italic = true })
hi("@markup.math", { fg = c.cyan })
hi("@markup.environment", { fg = c.yellow })

-- Diff
hi("@diff.plus", { fg = c.green })
hi("@diff.minus", { fg = c.red })
hi("@diff.delta", { fg = c.cyan })

-- Misc Treesitter
hi("@none", {})
hi("@text", { fg = c.fg })
hi("@text.emphasis", { italic = true })
hi("@text.strong", { bold = true })
hi("@text.strike", { strikethrough = true })
hi("@text.title", { fg = c.cyan, bold = true })
hi("@text.literal", { fg = c.green })
hi("@text.uri", { fg = c.cyan, underline = true })
hi("@text.todo", { fg = c.yellow, bold = true })
hi("@text.note", { fg = c.info })
hi("@text.warning", { fg = c.warning })
hi("@text.danger", { fg = c.error })
hi("@text.diff.add", { fg = c.green })
hi("@text.diff.delete", { fg = c.red })

-- ---------------------------------------------------------------------------
-- Semantic Tokens (LSP)
-- ---------------------------------------------------------------------------
hi("@lsp.type.class", { fg = c.purple })
hi("@lsp.type.decorator", { fg = c.magenta })
hi("@lsp.type.enum", { fg = c.lime })
hi("@lsp.type.enumMember", { fg = c.purple })
hi("@lsp.type.function", { fg = c.cyan })
hi("@lsp.type.interface", { fg = c.lime })
hi("@lsp.type.keyword", { fg = c.yellow })
hi("@lsp.type.macro", { fg = c.yellow })
hi("@lsp.type.method", { fg = c.cyan })
hi("@lsp.type.namespace", { fg = c.cyan })
hi("@lsp.type.parameter", { fg = c.magenta })
hi("@lsp.type.property", { fg = c.orange })
hi("@lsp.type.struct", { fg = c.lime })
hi("@lsp.type.type", { fg = c.lime })
hi("@lsp.type.typeParameter", { fg = c.lime })
hi("@lsp.type.variable", { fg = c.pink })

hi("@lsp.typemod.variable.defaultLibrary", { fg = c.teal })
hi("@lsp.typemod.variable.readonly", { fg = c.pink })
hi("@lsp.typemod.function.defaultLibrary", { fg = c.cyan })
hi("@lsp.typemod.method.defaultLibrary", { fg = c.cyan })
hi("@lsp.typemod.type.defaultLibrary", { fg = c.lime })
hi("@lsp.typemod.variable.globalScope", { fg = c.pink })
hi("@lsp.typemod.class.declaration", { fg = c.purple })
hi("@lsp.typemod.parameter.declaration", { fg = c.magenta })
hi("@lsp.typemod.property.declaration", { fg = c.fg })
hi("@lsp.typemod.enum.declaration", { fg = c.lime })
hi("@lsp.typemod.enumMember.declaration", { fg = c.purple })

hi("@lsp.mod.deprecated", { strikethrough = true })

-- ---------------------------------------------------------------------------
-- LSP Reference / Signature / CodeLens / InlayHint
-- ---------------------------------------------------------------------------
hi("LspReferenceText", { bg = c_blend.search_hl })
hi("LspReferenceRead", { bg = c_blend.search_hl })
hi("LspReferenceWrite", { bg = c_blend.search_bg, bold = true })
hi("LspSignatureActiveParameter", { fg = c.yellow, bold = true, underline = true })
hi("LspCodeLens", { fg = c.fg_muted, italic = true })
hi("LspCodeLensSeparator", { fg = "#2a2a2a" })
hi("LspInlayHint", { fg = "#5a5a5a", bg = "#1a1a1a", italic = true })

-- ---------------------------------------------------------------------------
-- Diagnostics
-- ---------------------------------------------------------------------------
hi("DiagnosticError", { fg = c.error })
hi("DiagnosticWarn", { fg = c.warning })
hi("DiagnosticInfo", { fg = c.info })
hi("DiagnosticHint", { fg = c.hint })

hi("DiagnosticVirtualTextError", { fg = c.error, bg = c_blend.diag_vt_error, italic = true })
hi("DiagnosticVirtualTextWarn", { fg = c.warning, bg = c_blend.diag_vt_warn, italic = true })
hi("DiagnosticVirtualTextInfo", { fg = c.info, bg = c_blend.diag_vt_info, italic = true })
hi("DiagnosticVirtualTextHint", { fg = c.hint, bg = c_blend.diag_vt_hint, italic = true })

hi("DiagnosticUnderlineError", { sp = c.error, undercurl = true })
hi("DiagnosticUnderlineWarn", { sp = c.warning, undercurl = true })
hi("DiagnosticUnderlineInfo", { sp = c.info, undercurl = true })
hi("DiagnosticUnderlineHint", { sp = c.hint, undercurl = true })

hi("DiagnosticSignError", { fg = c.error })
hi("DiagnosticSignWarn", { fg = c.warning })
hi("DiagnosticSignInfo", { fg = c.info })
hi("DiagnosticSignHint", { fg = c.hint })

hi("DiagnosticFloatingError", { fg = c.error })
hi("DiagnosticFloatingWarn", { fg = c.warning })
hi("DiagnosticFloatingInfo", { fg = c.info })
hi("DiagnosticFloatingHint", { fg = c.hint })

-- ---------------------------------------------------------------------------
-- Telescope
-- ---------------------------------------------------------------------------
hi("TelescopeNormal", { fg = c.fg, bg = c.bg_float })
hi("TelescopeBorder", { fg = c.border_focus, bg = c.bg_float })
hi("TelescopeTitle", { fg = c.yellow, bold = true })
hi("TelescopePromptNormal", { fg = c.fg, bg = c.bg_input })
hi("TelescopePromptBorder", { fg = c.border_focus, bg = c.bg_input })
hi("TelescopePromptTitle", { fg = c.yellow, bg = c.bg_input, bold = true })
hi("TelescopePromptPrefix", { fg = c.yellow })
hi("TelescopePromptCounter", { fg = c.fg_muted })
hi("TelescopeResultsNormal", { fg = c.fg, bg = c.bg_float })
hi("TelescopeResultsBorder", { fg = c.border_focus, bg = c.bg_float })
hi("TelescopeResultsTitle", { fg = c.fg_dim })
hi("TelescopePreviewNormal", { fg = c.fg, bg = c.bg_float })
hi("TelescopePreviewBorder", { fg = c.border_focus, bg = c.bg_float })
hi("TelescopePreviewTitle", { fg = c.cyan })
hi("TelescopeSelection", { fg = c.fg, bg = c_blend.list_sel })
hi("TelescopeSelectionCaret", { fg = c.yellow })
hi("TelescopeMultiSelection", { fg = c.magenta })
hi("TelescopeMultiIcon", { fg = c.magenta })
hi("TelescopeMatching", { fg = c.yellow, bold = true })
hi("TelescopePreviewMatch", { fg = c.yellow, bold = true })

-- ---------------------------------------------------------------------------
-- NeoTree
-- ---------------------------------------------------------------------------
hi("NeoTreeNormal", { fg = c.fg, bg = bg_sidebar })
hi("NeoTreeNormalNC", { fg = c.fg, bg = bg_sidebar })
hi("NeoTreeEndOfBuffer", { fg = bg_sidebar, bg = bg_sidebar })
hi("NeoTreeRootName", { fg = c.yellow, bold = true })
hi("NeoTreeFileName", { fg = c.fg })
hi("NeoTreeFileNameOpened", { fg = c.fg, bold = true })
hi("NeoTreeDirectoryName", { fg = c.cyan })
hi("NeoTreeDirectoryIcon", { fg = c.cyan })
hi("NeoTreeExpander", { fg = c.fg_muted })
hi("NeoTreeIndentMarker", { fg = "#2a2a2a" })
hi("NeoTreeGitAdded", { fg = c.green })
hi("NeoTreeGitModified", { fg = c.cyan })
hi("NeoTreeGitDeleted", { fg = c.red })
hi("NeoTreeGitConflict", { fg = c.orange, bold = true })
hi("NeoTreeGitIgnored", { fg = c.fg_muted })
hi("NeoTreeGitUnstaged", { fg = c.orange })
hi("NeoTreeGitUntracked", { fg = c.green })
hi("NeoTreeGitStaged", { fg = c.green })
hi("NeoTreeFloatBorder", { fg = c.border_focus, bg = c.bg_float })
hi("NeoTreeFloatTitle", { fg = c.yellow, bold = true })
hi("NeoTreeTitleBar", { fg = c.fg, bg = c.bg_darker, bold = true })
hi("NeoTreeCursorLine", { bg = c_blend.list_sel })
hi("NeoTreeDimText", { fg = c.fg_muted })
hi("NeoTreeDotfile", { fg = c.fg_muted })
hi("NeoTreeFilterTerm", { fg = c.yellow, bold = true })
hi("NeoTreeSymbolicLinkTarget", { fg = c.teal })
hi("NeoTreeTabActive", { fg = c.fg, bg = c.bg, bold = true })
hi("NeoTreeTabInactive", { fg = c.fg_muted, bg = c.bg_dark })
hi("NeoTreeTabSeparatorActive", { fg = c.border, bg = c.bg })
hi("NeoTreeTabSeparatorInactive", { fg = c.border, bg = c.bg_dark })
hi("NeoTreeWinSeparator", { fg = c.border, bg = bg_sidebar })

-- ---------------------------------------------------------------------------
-- GitSigns
-- ---------------------------------------------------------------------------
hi("GitSignsAdd", { fg = c.green })
hi("GitSignsChange", { fg = c.cyan })
hi("GitSignsDelete", { fg = c.red })
hi("GitSignsAddNr", { fg = c.green })
hi("GitSignsChangeNr", { fg = c.cyan })
hi("GitSignsDeleteNr", { fg = c.red })
hi("GitSignsAddLn", { bg = c_blend.diff_add_bg })
hi("GitSignsChangeLn", { bg = "#1a2028" })
hi("GitSignsDeleteLn", { bg = c_blend.diff_del_bg })
hi("GitSignsAddInline", { bg = "#1e2e1e" })
hi("GitSignsChangeInline", { bg = "#1e2830" })
hi("GitSignsDeleteInline", { bg = "#2e1e1e" })
hi("GitSignsAddPreview", { fg = c.green, bg = c_blend.diff_add_bg })
hi("GitSignsDeletePreview", { fg = c.red, bg = c_blend.diff_del_bg })
hi("GitSignsCurrentLineBlame", { fg = c.fg_muted, italic = true })
hi("GitSignsAddCul", { fg = c.green })
hi("GitSignsChangeCul", { fg = c.cyan })
hi("GitSignsDeleteCul", { fg = c.red })
hi("GitSignsStagedAdd", { fg = "#3a7a4a" })
hi("GitSignsStagedChange", { fg = "#2a7080" })
hi("GitSignsStagedDelete", { fg = "#7a3030" })

-- ---------------------------------------------------------------------------
-- BufferLine
-- ---------------------------------------------------------------------------
hi("BufferLineIndicatorSelected", { fg = c.tab_active_top })
hi("BufferLineIndicatorVisible", { fg = c.border })
hi("BufferLineFill", { bg = c.bg_dark })
hi("BufferLineBackground", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineBufferSelected", { fg = c.fg, bg = c.bg, bold = true })
hi("BufferLineBufferVisible", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineSeparator", { fg = c.border, bg = c.bg_dark })
hi("BufferLineSeparatorSelected", { fg = c.border, bg = c.bg })
hi("BufferLineSeparatorVisible", { fg = c.border, bg = c.bg_dark })
hi("BufferLineCloseButton", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineCloseButtonSelected", { fg = c.fg, bg = c.bg })
hi("BufferLineCloseButtonVisible", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineModified", { fg = c.yellow, bg = c.bg_dark })
hi("BufferLineModifiedSelected", { fg = c.yellow, bg = c.bg })
hi("BufferLineModifiedVisible", { fg = c.yellow, bg = c.bg_dark })
hi("BufferLineTab", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineTabSelected", { fg = c.fg, bg = c.bg, bold = true })
hi("BufferLineTabClose", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineDuplicate", { fg = c.fg_muted, bg = c.bg_dark, italic = true })
hi("BufferLineDuplicateSelected", { fg = c.fg, bg = c.bg, italic = true })
hi("BufferLineDuplicateVisible", { fg = c.fg_muted, bg = c.bg_dark, italic = true })
hi("BufferLineDiagnostic", { fg = c.fg_muted })
hi("BufferLineError", { fg = c.error, bg = c.bg_dark })
hi("BufferLineErrorSelected", { fg = c.error, bg = c.bg })
hi("BufferLineErrorDiagnostic", { fg = c.error, bg = c.bg_dark })
hi("BufferLineErrorDiagnosticSelected", { fg = c.error, bg = c.bg })
hi("BufferLineWarning", { fg = c.warning, bg = c.bg_dark })
hi("BufferLineWarningSelected", { fg = c.warning, bg = c.bg })
hi("BufferLineWarningDiagnostic", { fg = c.warning, bg = c.bg_dark })
hi("BufferLineWarningDiagnosticSelected", { fg = c.warning, bg = c.bg })
hi("BufferLineInfo", { fg = c.info, bg = c.bg_dark })
hi("BufferLineInfoSelected", { fg = c.info, bg = c.bg })
hi("BufferLineInfoDiagnostic", { fg = c.info, bg = c.bg_dark })
hi("BufferLineInfoDiagnosticSelected", { fg = c.info, bg = c.bg })
hi("BufferLineHint", { fg = c.hint, bg = c.bg_dark })
hi("BufferLineHintSelected", { fg = c.hint, bg = c.bg })
hi("BufferLineHintDiagnostic", { fg = c.hint, bg = c.bg_dark })
hi("BufferLineHintDiagnosticSelected", { fg = c.hint, bg = c.bg })
hi("BufferLineNumbers", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineNumbersSelected", { fg = c.fg, bg = c.bg })
hi("BufferLineNumbersVisible", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLinePick", { fg = c.yellow, bg = c.bg_dark, bold = true })
hi("BufferLinePickSelected", { fg = c.yellow, bg = c.bg, bold = true })
hi("BufferLinePickVisible", { fg = c.yellow, bg = c.bg_dark, bold = true })
hi("BufferLineOffsetSeparator", { fg = c.border, bg = bg_sidebar })
hi("BufferLineTruncMarker", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineGroupSeparator", { fg = c.fg_muted, bg = c.bg_dark })
hi("BufferLineGroupLabel", { fg = c.bg, bg = c.fg_muted })

-- ---------------------------------------------------------------------------
-- Lualine (minimal -- lualine handles its own theming, but these override)
-- ---------------------------------------------------------------------------
-- Lualine generally picks up Normal, StatusLine, etc.
-- We define the key groups for completeness.
hi("lualine_a_normal", { fg = c.bg, bg = c.yellow, bold = true })
hi("lualine_b_normal", { fg = c.fg, bg = "#2e2e2e" })
hi("lualine_c_normal", { fg = c.fg_dim, bg = "#1a1a1a" })
hi("lualine_a_insert", { fg = c.bg, bg = c.green, bold = true })
hi("lualine_a_visual", { fg = c.bg, bg = c.magenta, bold = true })
hi("lualine_a_replace", { fg = c.bg, bg = c.red, bold = true })
hi("lualine_a_command", { fg = c.bg, bg = c.orange, bold = true })
hi("lualine_a_terminal", { fg = c.bg, bg = c.teal, bold = true })
hi("lualine_a_inactive", { fg = c.fg_muted, bg = "#1a1a1a" })
hi("lualine_b_inactive", { fg = c.fg_muted, bg = "#1a1a1a" })
hi("lualine_c_inactive", { fg = c.fg_muted, bg = "#1a1a1a" })

-- ---------------------------------------------------------------------------
-- WhichKey
-- ---------------------------------------------------------------------------
hi("WhichKey", { fg = c.yellow })
hi("WhichKeyGroup", { fg = c.cyan })
hi("WhichKeyDesc", { fg = c.fg })
hi("WhichKeySeparator", { fg = c.fg_muted })
hi("WhichKeyFloat", { bg = c.bg_float })
hi("WhichKeyBorder", { fg = c.border_focus, bg = c.bg_float })
hi("WhichKeyValue", { fg = c.fg_dim })
hi("WhichKeyNormal", { fg = c.fg, bg = c.bg_float })

-- ---------------------------------------------------------------------------
-- Noice
-- ---------------------------------------------------------------------------
hi("NoiceCmdline", { fg = c.fg, bg = c.bg_float })
hi("NoiceCmdlineIcon", { fg = c.yellow })
hi("NoiceCmdlineIconSearch", { fg = c.yellow })
hi("NoiceCmdlinePopup", { fg = c.fg, bg = c.bg_float })
hi("NoiceCmdlinePopupBorder", { fg = c.border_focus })
hi("NoiceCmdlinePopupBorderSearch", { fg = c.yellow })
hi("NoiceConfirm", { fg = c.fg, bg = c.bg_float })
hi("NoiceConfirmBorder", { fg = c.border_focus })
hi("NoiceMini", { fg = c.fg_dim, bg = c.bg_float })
hi("NoicePopup", { fg = c.fg, bg = c.bg_float })
hi("NoicePopupBorder", { fg = c.border_focus })
hi("NoicePopupmenu", { fg = c.fg, bg = c.bg_popup })
hi("NoicePopupmenuBorder", { fg = c.border_focus })
hi("NoicePopupmenuMatch", { fg = c.yellow, bold = true })
hi("NoicePopupmenuSelected", { bg = c.bg_popup_sel })
hi("NoiceScrollbar", { bg = "#2a2a2a" })
hi("NoiceScrollbarThumb", { bg = c.fg_muted })
hi("NoiceFormatProgressDone", { fg = c.bg, bg = c.yellow })
hi("NoiceFormatProgressTodo", { fg = c.fg_muted, bg = "#2a2a2a" })
hi("NoiceLspProgressClient", { fg = c.cyan })
hi("NoiceLspProgressSpinner", { fg = c.yellow })
hi("NoiceLspProgressTitle", { fg = c.fg })
hi("NoiceFormatEvent", { fg = c.fg_dim })
hi("NoiceFormatTitle", { fg = c.yellow, bold = true })

-- ---------------------------------------------------------------------------
-- Notify (nvim-notify)
-- ---------------------------------------------------------------------------
hi("NotifyERRORBorder", { fg = c.error })
hi("NotifyWARNBorder", { fg = c.warning })
hi("NotifyINFOBorder", { fg = c.info })
hi("NotifyDEBUGBorder", { fg = c.fg_muted })
hi("NotifyTRACEBorder", { fg = c.purple })

hi("NotifyERRORIcon", { fg = c.error })
hi("NotifyWARNIcon", { fg = c.warning })
hi("NotifyINFOIcon", { fg = c.info })
hi("NotifyDEBUGIcon", { fg = c.fg_muted })
hi("NotifyTRACEIcon", { fg = c.purple })

hi("NotifyERRORTitle", { fg = c.error, bold = true })
hi("NotifyWARNTitle", { fg = c.warning, bold = true })
hi("NotifyINFOTitle", { fg = c.info, bold = true })
hi("NotifyDEBUGTitle", { fg = c.fg_muted, bold = true })
hi("NotifyTRACETitle", { fg = c.purple, bold = true })

hi("NotifyERRORBody", { fg = c.fg })
hi("NotifyWARNBody", { fg = c.fg })
hi("NotifyINFOBody", { fg = c.fg })
hi("NotifyDEBUGBody", { fg = c.fg })
hi("NotifyTRACEBody", { fg = c.fg })

hi("NotifyBackground", { bg = c.bg_float })

-- ---------------------------------------------------------------------------
-- nvim-cmp (Completion)
-- ---------------------------------------------------------------------------
hi("CmpItemAbbr", { fg = c.fg })
hi("CmpItemAbbrDeprecated", { fg = c.fg_muted, strikethrough = true })
hi("CmpItemAbbrMatch", { fg = c.yellow, bold = true })
hi("CmpItemAbbrMatchFuzzy", { fg = c.yellow, bold = true })
hi("CmpItemKind", { fg = c.fg_dim })
hi("CmpItemMenu", { fg = c.fg_muted })

hi("CmpItemKindText", { fg = c.fg })
hi("CmpItemKindMethod", { fg = c.cyan })
hi("CmpItemKindFunction", { fg = c.cyan })
hi("CmpItemKindConstructor", { fg = c.purple })
hi("CmpItemKindField", { fg = c.orange })
hi("CmpItemKindVariable", { fg = c.pink })
hi("CmpItemKindClass", { fg = c.purple })
hi("CmpItemKindInterface", { fg = c.lime })
hi("CmpItemKindModule", { fg = c.cyan })
hi("CmpItemKindProperty", { fg = c.orange })
hi("CmpItemKindUnit", { fg = c.red })
hi("CmpItemKindValue", { fg = c.red })
hi("CmpItemKindEnum", { fg = c.lime })
hi("CmpItemKindKeyword", { fg = c.yellow })
hi("CmpItemKindSnippet", { fg = c.teal })
hi("CmpItemKindColor", { fg = c.magenta })
hi("CmpItemKindFile", { fg = c.fg })
hi("CmpItemKindReference", { fg = c.cyan })
hi("CmpItemKindFolder", { fg = c.cyan })
hi("CmpItemKindEnumMember", { fg = c.purple })
hi("CmpItemKindConstant", { fg = c.red })
hi("CmpItemKindStruct", { fg = c.lime })
hi("CmpItemKindEvent", { fg = c.orange })
hi("CmpItemKindOperator", { fg = c.fg_dim })
hi("CmpItemKindTypeParameter", { fg = c.lime })
hi("CmpItemKindCopilot", { fg = c.teal })

-- blink.cmp (alternative completion)
hi("BlinkCmpMenu", { fg = c.fg, bg = c.bg_popup })
hi("BlinkCmpMenuBorder", { fg = c.border_focus, bg = c.bg_popup })
hi("BlinkCmpMenuSelection", { bg = c.bg_popup_sel })
hi("BlinkCmpLabel", { fg = c.fg })
hi("BlinkCmpLabelMatch", { fg = c.yellow, bold = true })
hi("BlinkCmpLabelDeprecated", { fg = c.fg_muted, strikethrough = true })
hi("BlinkCmpLabelDetail", { fg = c.fg_muted })
hi("BlinkCmpLabelDescription", { fg = c.fg_muted })
hi("BlinkCmpKind", { fg = c.fg_dim })
hi("BlinkCmpKindText", { fg = c.fg })
hi("BlinkCmpKindMethod", { fg = c.cyan })
hi("BlinkCmpKindFunction", { fg = c.cyan })
hi("BlinkCmpKindConstructor", { fg = c.purple })
hi("BlinkCmpKindField", { fg = c.orange })
hi("BlinkCmpKindVariable", { fg = c.pink })
hi("BlinkCmpKindClass", { fg = c.purple })
hi("BlinkCmpKindInterface", { fg = c.lime })
hi("BlinkCmpKindModule", { fg = c.cyan })
hi("BlinkCmpKindProperty", { fg = c.orange })
hi("BlinkCmpKindUnit", { fg = c.red })
hi("BlinkCmpKindValue", { fg = c.red })
hi("BlinkCmpKindEnum", { fg = c.lime })
hi("BlinkCmpKindKeyword", { fg = c.yellow })
hi("BlinkCmpKindSnippet", { fg = c.teal })
hi("BlinkCmpKindColor", { fg = c.magenta })
hi("BlinkCmpKindFile", { fg = c.fg })
hi("BlinkCmpKindReference", { fg = c.cyan })
hi("BlinkCmpKindFolder", { fg = c.cyan })
hi("BlinkCmpKindEnumMember", { fg = c.purple })
hi("BlinkCmpKindConstant", { fg = c.red })
hi("BlinkCmpKindStruct", { fg = c.lime })
hi("BlinkCmpKindEvent", { fg = c.orange })
hi("BlinkCmpKindOperator", { fg = c.fg_dim })
hi("BlinkCmpKindTypeParameter", { fg = c.lime })
hi("BlinkCmpDoc", { fg = c.fg, bg = c.bg_float })
hi("BlinkCmpDocBorder", { fg = c.border_focus, bg = c.bg_float })
hi("BlinkCmpDocSeparator", { fg = c.border_focus })
hi("BlinkCmpSignatureHelp", { fg = c.fg, bg = c.bg_float })
hi("BlinkCmpSignatureHelpBorder", { fg = c.border_focus, bg = c.bg_float })
hi("BlinkCmpSource", { fg = c.fg_muted })
hi("BlinkCmpGhostText", { fg = "#3a3a3a", italic = true })

-- ---------------------------------------------------------------------------
-- Indent-Blankline / IB
-- ---------------------------------------------------------------------------
hi("IndentBlanklineChar", { fg = c_blend.indent, nocombine = true })
hi("IndentBlanklineContextChar", { fg = c_blend.indent_active, nocombine = true })
hi("IndentBlanklineContextStart", { sp = c_blend.indent_active, underline = true })
hi("IndentBlanklineSpaceChar", { fg = c_blend.indent, nocombine = true })

hi("IblIndent", { fg = c_blend.indent, nocombine = true })
hi("IblScope", { fg = c_blend.indent_active, nocombine = true })
hi("IblWhitespace", { fg = c_blend.indent, nocombine = true })

-- ---------------------------------------------------------------------------
-- Rainbow Delimiters
-- ---------------------------------------------------------------------------
hi("RainbowDelimiterRed", { fg = c.yellow })
hi("RainbowDelimiterYellow", { fg = c.magenta })
hi("RainbowDelimiterBlue", { fg = c.cyan })
hi("RainbowDelimiterOrange", { fg = c.purple })
hi("RainbowDelimiterGreen", { fg = c.teal })
hi("RainbowDelimiterViolet", { fg = c.pink })
hi("RainbowDelimiterCyan", { fg = c.yellow })

-- Using the exact bracket colors from the palette:
hi("@punctuation.bracket.rainbow1", { fg = c.yellow })
hi("@punctuation.bracket.rainbow2", { fg = c.magenta })
hi("@punctuation.bracket.rainbow3", { fg = c.cyan })
hi("@punctuation.bracket.rainbow4", { fg = c.purple })
hi("@punctuation.bracket.rainbow5", { fg = c.teal })
hi("@punctuation.bracket.rainbow6", { fg = c.pink })

-- ---------------------------------------------------------------------------
-- Flash.nvim
-- ---------------------------------------------------------------------------
hi("FlashBackdrop", { fg = c.fg_muted })
hi("FlashLabel", { fg = c.bg, bg = c.yellow, bold = true })
hi("FlashMatch", { fg = c.fg, bg = c_blend.search_bg })
hi("FlashCurrent", { fg = c.fg, bg = c_blend.search_hl })
hi("FlashPrompt", { fg = c.yellow })
hi("FlashPromptIcon", { fg = c.yellow })
hi("FlashCursor", { reverse = true })

-- ---------------------------------------------------------------------------
-- Trouble
-- ---------------------------------------------------------------------------
hi("TroubleNormal", { fg = c.fg, bg = bg_sidebar })
hi("TroubleNormalNC", { fg = c.fg, bg = bg_sidebar })
hi("TroubleText", { fg = c.fg })
hi("TroubleCount", { fg = c.yellow, bold = true })
hi("TroubleFile", { fg = c.cyan })
hi("TroubleFoldIcon", { fg = c.fg_muted })
hi("TroubleLocation", { fg = c.fg_muted })
hi("TroublePreview", { bg = c_blend.search_hl })
hi("TroubleSource", { fg = c.fg_muted })
hi("TroubleSignError", { fg = c.error })
hi("TroubleSignWarning", { fg = c.warning })
hi("TroubleSignInformation", { fg = c.info })
hi("TroubleSignHint", { fg = c.hint })
hi("TroubleIndent", { fg = "#2a2a2a" })
hi("TroubleIndentFoldClosed", { fg = c.fg_muted })
hi("TroubleIndentFoldOpen", { fg = c.fg_muted })
hi("TroublePos", { fg = c.fg_muted })
hi("TroubleCode", { fg = c.fg_muted })

-- ---------------------------------------------------------------------------
-- Todo-comments
-- ---------------------------------------------------------------------------
hi("TodoBgFIX", { fg = c.bg, bg = c.error, bold = true })
hi("TodoFgFIX", { fg = c.error })
hi("TodoBgHACK", { fg = c.bg, bg = c.orange, bold = true })
hi("TodoFgHACK", { fg = c.orange })
hi("TodoBgNOTE", { fg = c.bg, bg = c.teal, bold = true })
hi("TodoFgNOTE", { fg = c.teal })
hi("TodoBgPERF", { fg = c.bg, bg = c.purple, bold = true })
hi("TodoFgPERF", { fg = c.purple })
hi("TodoBgTEST", { fg = c.bg, bg = c.cyan, bold = true })
hi("TodoFgTEST", { fg = c.cyan })
hi("TodoBgTODO", { fg = c.bg, bg = c.yellow, bold = true })
hi("TodoFgTODO", { fg = c.yellow })
hi("TodoBgWARN", { fg = c.bg, bg = c.warning, bold = true })
hi("TodoFgWARN", { fg = c.warning })
hi("TodoSignFIX", { fg = c.error })
hi("TodoSignHACK", { fg = c.orange })
hi("TodoSignNOTE", { fg = c.teal })
hi("TodoSignPERF", { fg = c.purple })
hi("TodoSignTEST", { fg = c.cyan })
hi("TodoSignTODO", { fg = c.yellow })
hi("TodoSignWARN", { fg = c.warning })

-- ---------------------------------------------------------------------------
-- Mini (mini.icons, mini.indentscope, etc.)
-- ---------------------------------------------------------------------------
hi("MiniIconsAzure", { fg = c.cyan })
hi("MiniIconsBlue", { fg = c.cyan })
hi("MiniIconsCyan", { fg = c.teal })
hi("MiniIconsGreen", { fg = c.green })
hi("MiniIconsGrey", { fg = c.fg_muted })
hi("MiniIconsOrange", { fg = c.orange })
hi("MiniIconsPurple", { fg = c.purple })
hi("MiniIconsRed", { fg = c.red })
hi("MiniIconsYellow", { fg = c.yellow })

hi("MiniIndentscopeSymbol", { fg = c_blend.indent_active })
hi("MiniIndentscopeSymbolOff", { fg = c_blend.indent })

hi("MiniStatuslineDevinfo", { fg = c.fg, bg = "#2e2e2e" })
hi("MiniStatuslineFileinfo", { fg = c.fg, bg = "#2e2e2e" })
hi("MiniStatuslineFilename", { fg = c.fg_dim, bg = "#1a1a1a" })
hi("MiniStatuslineInactive", { fg = c.fg_muted, bg = "#1a1a1a" })
hi("MiniStatuslineModeCommand", { fg = c.bg, bg = c.orange, bold = true })
hi("MiniStatuslineModeInsert", { fg = c.bg, bg = c.green, bold = true })
hi("MiniStatuslineModeNormal", { fg = c.bg, bg = c.yellow, bold = true })
hi("MiniStatuslineModeOther", { fg = c.bg, bg = c.teal, bold = true })
hi("MiniStatuslineModeReplace", { fg = c.bg, bg = c.red, bold = true })
hi("MiniStatuslineModeVisual", { fg = c.bg, bg = c.magenta, bold = true })

hi("MiniCursorword", { bg = c_blend.search_hl })
hi("MiniCursorwordCurrent", { bg = c_blend.search_hl })

hi("MiniSurround", { fg = c.bg, bg = c.yellow })

hi("MiniJump", { fg = c.bg, bg = c.yellow, bold = true })
hi("MiniJump2dSpot", { fg = c.yellow, bold = true, nocombine = true })
hi("MiniJump2dSpotAhead", { fg = c.cyan, bold = true, nocombine = true })
hi("MiniJump2dSpotUnique", { fg = c.orange, bold = true, nocombine = true })

hi("MiniPickBorder", { fg = c.border_focus })
hi("MiniPickBorderBusy", { fg = c.yellow })
hi("MiniPickBorderText", { fg = c.yellow, bold = true })
hi("MiniPickHeader", { fg = c.yellow })
hi("MiniPickMatchCurrent", { bg = c_blend.list_sel })
hi("MiniPickMatchMarked", { fg = c.yellow, bold = true })
hi("MiniPickMatchRanges", { fg = c.yellow, bold = true })
hi("MiniPickNormal", { fg = c.fg, bg = c.bg_float })
hi("MiniPickPreviewLine", { bg = c_blend.search_hl })
hi("MiniPickPreviewRegion", { bg = c_blend.search_bg })
hi("MiniPickPrompt", { fg = c.yellow })

hi("MiniNotifyBorder", { fg = c.border_focus })
hi("MiniNotifyNormal", { fg = c.fg, bg = c.bg_float })
hi("MiniNotifyTitle", { fg = c.yellow, bold = true })

hi("MiniDiffSignAdd", { fg = c.green })
hi("MiniDiffSignChange", { fg = c.cyan })
hi("MiniDiffSignDelete", { fg = c.red })
hi("MiniDiffOverAdd", { bg = c_blend.diff_add_bg })
hi("MiniDiffOverChange", { bg = "#1a2028" })
hi("MiniDiffOverContext", { bg = c_blend.line_hl })
hi("MiniDiffOverDelete", { bg = c_blend.diff_del_bg })

-- ---------------------------------------------------------------------------
-- Aerial
-- ---------------------------------------------------------------------------
hi("AerialNormal", { fg = c.fg, bg = bg_sidebar })
hi("AerialLine", { bg = c_blend.list_sel })
hi("AerialGuide", { fg = "#2a2a2a" })

hi("AerialArrayIcon", { fg = c.orange })
hi("AerialBooleanIcon", { fg = c.red })
hi("AerialClassIcon", { fg = c.purple })
hi("AerialConstantIcon", { fg = c.red })
hi("AerialConstructorIcon", { fg = c.purple })
hi("AerialEnumIcon", { fg = c.lime })
hi("AerialEnumMemberIcon", { fg = c.purple })
hi("AerialEventIcon", { fg = c.orange })
hi("AerialFieldIcon", { fg = c.orange })
hi("AerialFileIcon", { fg = c.fg })
hi("AerialFunctionIcon", { fg = c.cyan })
hi("AerialInterfaceIcon", { fg = c.lime })
hi("AerialKeyIcon", { fg = c.yellow })
hi("AerialMethodIcon", { fg = c.cyan })
hi("AerialModuleIcon", { fg = c.cyan })
hi("AerialNamespaceIcon", { fg = c.cyan })
hi("AerialNumberIcon", { fg = c.red })
hi("AerialObjectIcon", { fg = c.orange })
hi("AerialOperatorIcon", { fg = c.fg_dim })
hi("AerialPackageIcon", { fg = c.cyan })
hi("AerialPropertyIcon", { fg = c.orange })
hi("AerialStringIcon", { fg = c.green })
hi("AerialStructIcon", { fg = c.lime })
hi("AerialTypeParameterIcon", { fg = c.lime })
hi("AerialVariableIcon", { fg = c.pink })

-- ---------------------------------------------------------------------------
-- Avante
-- ---------------------------------------------------------------------------
hi("AvanteTitle", { fg = c.yellow, bold = true })
hi("AvanteReversedTitle", { fg = c.yellow })
hi("AvanteSubtitle", { fg = c.cyan })
hi("AvanteReversedSubtitle", { fg = c.cyan })
hi("AvanteThirdTitle", { fg = c.teal })
hi("AvanteReversedThirdTitle", { fg = c.teal })
hi("AvanteSuggestion", { fg = c.fg_muted, italic = true })
hi("AvanteAnnotation", { fg = c.fg_muted })
hi("AvanteConflictCurrent", { bg = "#1e2e1e" })
hi("AvanteConflictIncoming", { bg = "#1e1e2e" })
hi("AvanteConflictCurrentLabel", { fg = c.bg, bg = c.green, bold = true })
hi("AvanteConflictIncomingLabel", { fg = c.bg, bg = c.cyan, bold = true })
hi("AvantePopupHint", { fg = c.fg_muted })
hi("AvanteInlineHint", { fg = "#5a5a5a", italic = true })

-- ---------------------------------------------------------------------------
-- Dashboard / Alpha
-- ---------------------------------------------------------------------------
hi("DashboardHeader", { fg = c.yellow })
hi("DashboardFooter", { fg = c.fg_muted, italic = true })
hi("DashboardDesc", { fg = c.fg })
hi("DashboardKey", { fg = c.yellow })
hi("DashboardIcon", { fg = c.cyan })
hi("DashboardShortCut", { fg = c.cyan })
hi("DashboardCenter", { fg = c.fg })
hi("DashboardMruTitle", { fg = c.yellow, bold = true })
hi("DashboardProjectTitle", { fg = c.yellow, bold = true })
hi("DashboardProjectIcon", { fg = c.cyan })
hi("DashboardProjectTitleIcon", { fg = c.cyan })
hi("DashboardFiles", { fg = c.fg })

hi("AlphaHeader", { fg = c.yellow })
hi("AlphaFooter", { fg = c.fg_muted, italic = true })
hi("AlphaButtons", { fg = c.fg })
hi("AlphaShortcut", { fg = c.yellow })

-- ---------------------------------------------------------------------------
-- Lazy.nvim
-- ---------------------------------------------------------------------------
hi("LazyNormal", { fg = c.fg, bg = c.bg_float })
hi("LazyButton", { fg = c.fg, bg = "#2a2a2a" })
hi("LazyButtonActive", { fg = c.bg, bg = c.yellow, bold = true })
hi("LazyComment", { fg = c.fg_muted })
hi("LazyCommit", { fg = c.fg_muted })
hi("LazyCommitIssue", { fg = c.cyan })
hi("LazyCommitScope", { fg = c.fg_dim, italic = true })
hi("LazyCommitType", { fg = c.cyan, bold = true })
hi("LazyDimmed", { fg = c.fg_muted })
hi("LazyDir", { fg = c.cyan })
hi("LazyH1", { fg = c.bg, bg = c.yellow, bold = true })
hi("LazyH2", { fg = c.yellow, bold = true })
hi("LazyLocal", { fg = c.orange })
hi("LazyNoCond", { fg = c.error })
hi("LazyProgressDone", { fg = c.yellow })
hi("LazyProgressTodo", { fg = c.fg_muted })
hi("LazyProp", { fg = c.fg_muted })
hi("LazyReasonCmd", { fg = c.cyan })
hi("LazyReasonEvent", { fg = c.orange })
hi("LazyReasonFt", { fg = c.lime })
hi("LazyReasonImport", { fg = c.yellow })
hi("LazyReasonKeys", { fg = c.magenta })
hi("LazyReasonPlugin", { fg = c.purple })
hi("LazyReasonRequire", { fg = c.teal })
hi("LazyReasonRuntime", { fg = c.fg_dim })
hi("LazyReasonSource", { fg = c.green })
hi("LazyReasonStart", { fg = c.yellow })
hi("LazySpecial", { fg = c.yellow })
hi("LazyTaskError", { fg = c.error })
hi("LazyTaskOutput", { fg = c.fg })
hi("LazyUrl", { fg = c.cyan, underline = true })
hi("LazyValue", { fg = c.green })

-- ---------------------------------------------------------------------------
-- Snacks.nvim
-- ---------------------------------------------------------------------------
hi("SnacksNormal", { fg = c.fg, bg = c.bg_float })
hi("SnacksDashboardNormal", { fg = c.fg, bg = bg_normal })
hi("SnacksDashboardDesc", { fg = c.fg })
hi("SnacksDashboardFile", { fg = c.fg })
hi("SnacksDashboardDir", { fg = c.fg_muted })
hi("SnacksDashboardFooter", { fg = c.fg_muted, italic = true })
hi("SnacksDashboardHeader", { fg = c.yellow })
hi("SnacksDashboardIcon", { fg = c.cyan })
hi("SnacksDashboardKey", { fg = c.yellow })
hi("SnacksDashboardSpecial", { fg = c.yellow })
hi("SnacksDashboardTitle", { fg = c.yellow, bold = true })

hi("SnacksNotifierError", { fg = c.error })
hi("SnacksNotifierWarn", { fg = c.warning })
hi("SnacksNotifierInfo", { fg = c.info })
hi("SnacksNotifierDebug", { fg = c.fg_muted })
hi("SnacksNotifierTrace", { fg = c.purple })
hi("SnacksNotifierIconError", { fg = c.error })
hi("SnacksNotifierIconWarn", { fg = c.warning })
hi("SnacksNotifierIconInfo", { fg = c.info })
hi("SnacksNotifierIconDebug", { fg = c.fg_muted })
hi("SnacksNotifierIconTrace", { fg = c.purple })
hi("SnacksNotifierTitleError", { fg = c.error, bold = true })
hi("SnacksNotifierTitleWarn", { fg = c.warning, bold = true })
hi("SnacksNotifierTitleInfo", { fg = c.info, bold = true })
hi("SnacksNotifierTitleDebug", { fg = c.fg_muted, bold = true })
hi("SnacksNotifierTitleTrace", { fg = c.purple, bold = true })
hi("SnacksNotifierBorderError", { fg = c.error })
hi("SnacksNotifierBorderWarn", { fg = c.warning })
hi("SnacksNotifierBorderInfo", { fg = c.info })
hi("SnacksNotifierBorderDebug", { fg = c.fg_muted })
hi("SnacksNotifierBorderTrace", { fg = c.purple })

hi("SnacksIndent", { fg = c_blend.indent, nocombine = true })
hi("SnacksIndentScope", { fg = c_blend.indent_active, nocombine = true })
hi("SnacksIndentChunk", { fg = c_blend.indent_active, nocombine = true })

hi("SnacksPickerDir", { fg = c.fg_muted })
hi("SnacksPickerFile", { fg = c.fg })
hi("SnacksPickerMatch", { fg = c.yellow, bold = true })
hi("SnacksPickerSelected", { fg = c.yellow })

-- ---------------------------------------------------------------------------
-- Markdown rendering (render-markdown.nvim)
-- ---------------------------------------------------------------------------
hi("RenderMarkdownH1", { fg = c.cyan, bold = true })
hi("RenderMarkdownH1Bg", { bg = "#142030" })
hi("RenderMarkdownH2", { fg = c.yellow, bold = true })
hi("RenderMarkdownH2Bg", { bg = "#2a2814" })
hi("RenderMarkdownH3", { fg = c.green, bold = true })
hi("RenderMarkdownH3Bg", { bg = "#142814" })
hi("RenderMarkdownH4", { fg = c.orange, bold = true })
hi("RenderMarkdownH4Bg", { bg = "#281e14" })
hi("RenderMarkdownH5", { fg = c.purple, bold = true })
hi("RenderMarkdownH5Bg", { bg = "#201828" })
hi("RenderMarkdownH6", { fg = c.magenta, bold = true })
hi("RenderMarkdownH6Bg", { bg = "#281428" })
hi("RenderMarkdownCode", { bg = "#1a1a1a" })
hi("RenderMarkdownCodeInline", { fg = c.green, bg = "#1a1a1a" })
hi("RenderMarkdownBullet", { fg = c.fg_dim })
hi("RenderMarkdownQuote", { fg = c.fg_muted, italic = true })
hi("RenderMarkdownDash", { fg = "#2a2a2a" })
hi("RenderMarkdownLink", { fg = c.cyan, underline = true })
hi("RenderMarkdownMath", { fg = c.cyan })
hi("RenderMarkdownChecked", { fg = c.green })
hi("RenderMarkdownUnchecked", { fg = c.fg_muted })
hi("RenderMarkdownTableHead", { fg = c.yellow, bold = true })
hi("RenderMarkdownTableRow", { fg = c.fg })
hi("RenderMarkdownTableFill", { fg = "#2a2a2a" })

-- ---------------------------------------------------------------------------
-- Nvim-navic (breadcrumbs)
-- ---------------------------------------------------------------------------
hi("NavicText", { fg = c.fg })
hi("NavicSeparator", { fg = c.fg_muted })
hi("NavicIconsArray", { fg = c.orange })
hi("NavicIconsBoolean", { fg = c.red })
hi("NavicIconsClass", { fg = c.purple })
hi("NavicIconsConstant", { fg = c.red })
hi("NavicIconsConstructor", { fg = c.purple })
hi("NavicIconsEnum", { fg = c.lime })
hi("NavicIconsEnumMember", { fg = c.purple })
hi("NavicIconsEvent", { fg = c.orange })
hi("NavicIconsField", { fg = c.orange })
hi("NavicIconsFile", { fg = c.fg })
hi("NavicIconsFunction", { fg = c.cyan })
hi("NavicIconsInterface", { fg = c.lime })
hi("NavicIconsKey", { fg = c.yellow })
hi("NavicIconsMethod", { fg = c.cyan })
hi("NavicIconsModule", { fg = c.cyan })
hi("NavicIconsNamespace", { fg = c.cyan })
hi("NavicIconsNull", { fg = c.red })
hi("NavicIconsNumber", { fg = c.red })
hi("NavicIconsObject", { fg = c.orange })
hi("NavicIconsOperator", { fg = c.fg_dim })
hi("NavicIconsPackage", { fg = c.cyan })
hi("NavicIconsProperty", { fg = c.orange })
hi("NavicIconsString", { fg = c.green })
hi("NavicIconsStruct", { fg = c.lime })
hi("NavicIconsTypeParameter", { fg = c.lime })
hi("NavicIconsVariable", { fg = c.pink })

-- ---------------------------------------------------------------------------
-- Git decorations (fugitive, etc.)
-- ---------------------------------------------------------------------------
hi("gitcommitSelectedFile", { fg = c.green })
hi("gitcommitDiscardedFile", { fg = c.red })
hi("gitcommitUntrackedFile", { fg = c.green })
hi("gitcommitBranch", { fg = c.yellow, bold = true })
hi("gitcommitHeader", { fg = c.fg })
hi("gitcommitSummary", { fg = c.fg })
hi("gitcommitOverflow", { fg = c.red })

-- ---------------------------------------------------------------------------
-- Neogit
-- ---------------------------------------------------------------------------
hi("NeogitDiffAdd", { fg = c.green, bg = c_blend.diff_add_bg })
hi("NeogitDiffDelete", { fg = c.red, bg = c_blend.diff_del_bg })
hi("NeogitDiffAddHighlight", { fg = c.green, bg = "#1e2e1e" })
hi("NeogitDiffDeleteHighlight", { fg = c.red, bg = "#2e1e1e" })
hi("NeogitDiffContextHighlight", { bg = c_blend.line_hl })
hi("NeogitHunkHeader", { fg = c.fg, bg = "#2a2a2a" })
hi("NeogitHunkHeaderHighlight", { fg = c.fg, bg = "#3a3a3a", bold = true })
hi("NeogitBranch", { fg = c.yellow, bold = true })
hi("NeogitRemote", { fg = c.cyan })

-- ---------------------------------------------------------------------------
-- Language-specific overrides
-- ---------------------------------------------------------------------------

-- JSON
hi("@label.json", { fg = c.yellow })
hi("@property.json", { fg = c.yellow })
hi("@string.json", { fg = c.green })

-- YAML
hi("@field.yaml", { fg = c.yellow })
hi("@property.yaml", { fg = c.yellow })

-- TOML
hi("@property.toml", { fg = c.yellow })
hi("@type.toml", { fg = c.cyan })

-- CSS / SCSS
hi("@property.css", { fg = c.cyan })
hi("@string.css", { fg = c.green })
hi("@number.css", { fg = c.red })
hi("@type.css", { fg = c.red })
hi("@tag.css", { fg = c.red })
hi("@property.scss", { fg = c.cyan })

-- HTML
hi("@tag.html", { fg = c.red })
hi("@tag.attribute.html", { fg = c.yellow })

-- Lua
hi("@constructor.lua", { fg = c.fg_dim }) -- {} in lua tables

-- Python
hi("@attribute.python", { fg = c.magenta }) -- decorators
hi("@constructor.python", { fg = c.cyan })

-- Rust
hi("@type.qualifier.rust", { fg = c.yellow })

-- Go
hi("@type.builtin.go", { fg = c.lime })

-- TypeScript/JavaScript
hi("@keyword.export.typescript", { fg = c.yellow })
hi("@keyword.export.tsx", { fg = c.yellow })
hi("@tag.tsx", { fg = c.red })
hi("@tag.attribute.tsx", { fg = c.yellow })
hi("@constructor.tsx", { fg = c.purple })

-- ---------------------------------------------------------------------------
-- Terminal Colors
-- ---------------------------------------------------------------------------
vim.g.terminal_color_0 = "#141414" -- black
vim.g.terminal_color_1 = "#ff5555" -- red
vim.g.terminal_color_2 = "#66ff88" -- green
vim.g.terminal_color_3 = "#ffee00" -- yellow
vim.g.terminal_color_4 = "#44ddff" -- blue
vim.g.terminal_color_5 = "#ff44ff" -- magenta
vim.g.terminal_color_6 = "#44ffcc" -- cyan
vim.g.terminal_color_7 = "#c7c7c7" -- white

vim.g.terminal_color_8 = "#444444" -- bright black
vim.g.terminal_color_9 = "#ff3333" -- bright red
vim.g.terminal_color_10 = "#88ff44" -- bright green
vim.g.terminal_color_11 = "#ffee00" -- bright yellow
vim.g.terminal_color_12 = "#00eeff" -- bright blue
vim.g.terminal_color_13 = "#ff44ff" -- bright magenta
vim.g.terminal_color_14 = "#00ffcc" -- bright cyan
vim.g.terminal_color_15 = "#fafafa" -- bright white

-- vim: ts=2 sw=2 et

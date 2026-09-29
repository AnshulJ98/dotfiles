-- Indent guides with VS Code's look: a thin solid line, and the guide of the
-- scope under the cursor coloured like the bracket pair that opens it. The
-- IblScopeBracket groups (config.colorscheme) are dimmed copies of the
-- BracketPair groups config.rainbow assigns, index for index.

vim.pack.add { 'https://github.com/lukas-reineke/indent-blankline.nvim' }

local ibl = require 'ibl'
local hooks = require 'ibl.hooks'

local scope_highlights = {}
local bracket_level = {}
for i, group in ipairs(vim.g.rainbow_delimiters.highlight) do
  scope_highlights[i] = 'IblScopeBracket' .. i
  bracket_level[group] = i
end
local no_bracket = #scope_highlights + 1
scope_highlights[no_bracket] = 'IblScope'

local function bracket_level_at(bufnr, row, col)
  for _, extmark in ipairs(vim.api.nvim_buf_get_extmarks(bufnr, -1, { row, col }, { row, col }, { type = 'highlight', details = true })) do
    local level = bracket_level[extmark[4].hl_group]
    if level then return level end
  end
end

-- ibl's own scope_highlight_from_extmark matches extmarks against the scope
-- highlight names, which would make the guide the full-strength bracket
-- colour. Same probes in the same order: the scope's closing and opening
-- characters, then the first character of its last line and the last of its
-- first, for languages whose scope node reaches past the brackets.
hooks.register(hooks.type.SCOPE_HIGHLIGHT, function(_, bufnr, scope)
  local start_row, start_col = scope:start()
  local end_row, end_col = scope:end_()
  local start_line = vim.api.nvim_buf_get_lines(bufnr, start_row, start_row + 1, false)[1] or ''
  local end_line = vim.api.nvim_buf_get_lines(bufnr, end_row, end_row + 1, false)[1] or ''
  return bracket_level_at(bufnr, end_row, math.max(end_col - 1, 0))
    or bracket_level_at(bufnr, start_row, start_col)
    or bracket_level_at(bufnr, end_row, math.max((end_line:find '%S' or 1) - 1, 0))
    or bracket_level_at(bufnr, start_row, math.max(#start_line - 1, 0))
    or no_bracket
end)

-- VS Code guides the innermost bracket pair around the cursor. ibl's own
-- JS/TS scopes are functions and loops, so inside a parameter list or an
-- object literal it guided the whole enclosing function in that function's
-- colour. Here the bracketed nodes are the scopes and the bracketless ones
-- are dropped; JSX tags are not brackets to VS Code either.
local bracket_nodes = {
  'arguments',
  'array',
  'array_pattern',
  'class_body',
  'enum_body',
  'export_clause',
  'formal_parameters',
  'interface_body',
  'named_imports',
  'object',
  'object_pattern',
  'object_type',
  'parenthesized_expression',
  'statement_block',
  'switch_body',
  'template_substitution',
  'tuple_type',
}
local bracketless_nodes = {
  'arrow_function',
  'catch_clause',
  'for_in_statement',
  'for_statement',
  'function_declaration',
  'jsx_element',
  'method_definition',
}
local include, exclude = {}, {}
for _, lang in ipairs { 'javascript', 'typescript', 'tsx' } do
  include[lang] = bracket_nodes
  exclude[lang] = bracketless_nodes
end

ibl.setup {
  indent = { char = '▏' },
  -- VS Code draws no line under the scope's opening statement.
  scope = {
    char = '▏',
    highlight = scope_highlights,
    show_start = false,
    show_end = false,
    include = { node_type = include },
    exclude = { node_type = exclude },
  },
}

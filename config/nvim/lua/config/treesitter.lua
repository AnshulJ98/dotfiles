vim.pack.add { { src = 'https://github.com/nvim-treesitter/nvim-treesitter', version = 'main' } }

local parsers =
  { 'diff', 'javascript', 'json', 'lua', 'luadoc', 'markdown', 'markdown_inline', 'python', 'query', 'tsx', 'typescript', 'vim', 'vimdoc', 'yaml' }
require('nvim-treesitter').install(parsers)

-- Folds come from the language server when it offers folding ranges, as VS
-- Code's do, and from treesitter otherwise. vim.lsp.foldexpr() turns a
-- buffer's LSP folding off whenever 'foldexpr' is set again, so every writer
-- goes through here and leaves an unchanged value alone.
---@param buf integer
local function set_foldexpr(buf)
  local from_lsp = #vim.lsp.get_clients { bufnr = buf, method = 'textDocument/foldingRange' } > 0
  if not from_lsp and not vim.treesitter.highlighter.active[buf] then return end
  local expr = from_lsp and 'v:lua.vim.lsp.foldexpr()' or 'v:lua.vim.treesitter.foldexpr()'
  for _, win in ipairs(vim.fn.win_findbuf(buf)) do
    local wo = vim.wo[win][0]
    if wo.foldexpr ~= expr then wo.foldexpr = expr end
    wo.foldmethod = 'expr'
  end
end

vim.api.nvim_create_autocmd({ 'LspAttach', 'LspDetach' }, {
  desc = 'Fold from the language server while one with folding ranges is attached',
  group = vim.api.nvim_create_augroup('lsp-folding', { clear = true }),
  -- Scheduled: on LspDetach the leaving client still counts as attached.
  callback = function(args)
    vim.schedule(function()
      if vim.api.nvim_buf_is_valid(args.buf) then set_foldexpr(args.buf) end
    end)
  end,
})

---@param buf integer
---@param language string
local function treesitter_try_attach(buf, language)
  if not vim.treesitter.language.add(language) then return end
  vim.treesitter.start(buf, language)

  set_foldexpr(buf)

  -- Without an indent query the indentexpr falls back to vim's built-in one.
  local has_indent_query = vim.treesitter.query.get(language, 'indents') ~= nil
  if has_indent_query then vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()" end
end

local available_parsers = require('nvim-treesitter').get_available()
vim.api.nvim_create_autocmd('FileType', {
  desc = 'Attach treesitter, installing the parser first when needed',
  group = vim.api.nvim_create_augroup('treesitter-attach', { clear = true }),
  callback = function(args)
    local buf, filetype = args.buf, args.match

    local language = vim.treesitter.language.get_lang(filetype)
    if not language then return end

    local installed_parsers = require('nvim-treesitter').get_installed 'parsers'

    if vim.tbl_contains(installed_parsers, language) then
      treesitter_try_attach(buf, language)
    elseif vim.tbl_contains(available_parsers, language) then
      -- The install finishes on a later tick, with whatever window is
      -- current by then; the buffer's own window is the one to attach in.
      require('nvim-treesitter').install(language):await(function()
        if not vim.api.nvim_buf_is_valid(buf) then return end
        vim.api.nvim_buf_call(buf, function() treesitter_try_attach(buf, language) end)
      end)
    else
      -- The parser may exist outside nvim-treesitter (a bundled one, for instance).
      treesitter_try_attach(buf, language)
    end
  end,
})

-- Sticky scroll: the enclosing class and function signatures stay pinned
-- above the viewport, as in VS Code. Bearded ships the highlight groups.
vim.pack.add { 'https://github.com/nvim-treesitter/nvim-treesitter-context' }
-- 'topline' pins the scopes enclosing the first visible line, as VS Code
-- does; the default 'cursor' follows the cursor, so a function scrolled past
-- vanished from the header while the cursor sat above it.
require('treesitter-context').setup {
  mode = 'topline',
  max_lines = 4,
  multiline_threshold = 1,
  trim_scope = 'inner',
}

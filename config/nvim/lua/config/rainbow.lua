-- Bracket pair colouring, VS Code's editor.bracketPairColorization. The six
-- BracketPair groups are defined in config.colorscheme. VS Code's
-- independentColorPoolPerBracketType has no equivalent here: colours cycle by
-- nesting depth across all bracket types.

vim.pack.add { 'https://github.com/HiPhish/rainbow-delimiters.nvim' }

vim.g.rainbow_delimiters = {
  -- The default queries for these colour JSX tag names too; VS Code leaves tags alone.
  query = {
    javascript = 'rainbow-parens',
    tsx = 'rainbow-parens',
  },
  highlight = { 'BracketPair1', 'BracketPair2', 'BracketPair3', 'BracketPair4', 'BracketPair5', 'BracketPair6' },
}

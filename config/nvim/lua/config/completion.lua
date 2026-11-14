vim.pack.add { { src = 'https://github.com/saghen/blink.cmp', version = vim.version.range '1.*' } }
require('blink.cmp').setup {
  keymap = { preset = 'default' },

  appearance = { nerd_font_variant = 'mono' },

  completion = {
    documentation = { auto_show = true, auto_show_delay_ms = 500 },
  },

  sources = {
    default = { 'lsp', 'path', 'snippets' },
  },

  snippets = { preset = 'default' },

  fuzzy = { implementation = 'prefer_rust_with_warning' },

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

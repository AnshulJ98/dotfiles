vim.pack.add { { src = 'https://github.com/saghen/blink.cmp', version = vim.version.range '1.*' } }
require('blink.cmp').setup {
  keymap = { preset = 'default' },

  appearance = { nerd_font_variant = 'mono' },

  completion = {
    documentation = { auto_show = true, auto_show_delay_ms = 500 },
  },

  sources = {
    default = { 'lsp', 'path', 'snippets' },
    -- Tables and columns of the buffer's connection (b:db), set by
    -- vim-dadbod-ui query buffers and the grip query pad (config.dadbod).
    per_filetype = { sql = { inherit_defaults = true, 'dadbod_grip' } },
    providers = { dadbod_grip = { name = 'Grip SQL', module = 'dadbod-grip.completion.blink' } },
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

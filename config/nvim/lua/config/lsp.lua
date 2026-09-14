vim.pack.add { 'https://github.com/j-hui/fidget.nvim' }
require('fidget').setup {}

vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('lsp-attach', { clear = true }),
  callback = function(event)
    local map = function(keys, func, desc, mode)
      mode = mode or 'n'
      vim.keymap.set(mode, keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
    end

    map('grn', vim.lsp.buf.rename, '[R]e[n]ame')
    map('gra', vim.lsp.buf.code_action, '[G]oto Code [A]ction', { 'n', 'x' })
    map('grD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')

    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if client and client:supports_method('textDocument/documentHighlight', event.buf) then
      local highlight_augroup = vim.api.nvim_create_augroup('lsp-highlight', { clear = false })
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
        group = vim.api.nvim_create_augroup('lsp-detach', { clear = true }),
        callback = function(event2)
          vim.lsp.buf.clear_references()
          vim.api.nvim_clear_autocmds { group = 'lsp-highlight', buffer = event2.buf }
        end,
      })
    end

    -- Inlay hints off until asked for. The toggle is buffer-scoped on both
    -- sides: `is_enabled` reads this buffer, so `enable` has to write it
    -- too, or one press flips every buffer that has a capable server.
    -- vtsls is trimmed to parameter names below, for when they are on.
    if client and client:supports_method('textDocument/inlayHint', event.buf) then
      map(
        '<leader>th',
        function() vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled { bufnr = event.buf }, { bufnr = event.buf }) end,
        '[T]oggle Inlay [H]ints'
      )
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
  'https://github.com/neovim/nvim-lspconfig',
  'https://github.com/mason-org/mason.nvim',
  'https://github.com/WhoIsSethDaniel/mason-tool-installer.nvim',
  'https://github.com/b0o/SchemaStore.nvim',
}

require('mason').setup {}

-- Mason package names, one per server above plus the formatters, linters
-- and debug adapters. A name the registry does not know errors at the
-- deferred install, so a typo is loud.
require('mason-tool-installer').setup {
  ensure_installed = {
    'bash-language-server',
    'eslint-lsp',
    'json-lsp',
    'lua-language-server',
    'markdown-oxide',
    'pyright',
    'vtsls',
    'yaml-language-server',
    'stylua',
    'prettierd',
    'ruff',
    'shfmt',
    'shellcheck',
    'markdownlint',
    'js-debug-adapter',
    'delve',
  },
}

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

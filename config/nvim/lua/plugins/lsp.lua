-- LSP: enable inlay hints globally + modern diagnostic UX
return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      inlay_hints = { enabled = true },
      diagnostics = {
        underline = true,
        update_in_insert = false,
        severity_sort = true,
        virtual_text = false,
        virtual_lines = { current_line = true },
        signs = {
          text = {
            [vim.diagnostic.severity.ERROR] = "✖",
            [vim.diagnostic.severity.WARN] = "▲",
            [vim.diagnostic.severity.HINT] = "⚑",
            [vim.diagnostic.severity.INFO] = "»",
          },
        },
        float = {
          border = "rounded",
          source = true,
          header = "",
          prefix = "",
        },
      },
      -- Per-server setup overrides
      setup = {
        -- Nil-safe rewrite of LazyVim's gopls semantic-tokens workaround.
        -- Upstream (lang/go.lua:60) indexes client.config.capabilities.textDocument
        -- which is nil on nvim 0.12+ under the new vim.lsp.config flow.
        gopls = function(_, _)
          Snacks.util.lsp.on({ name = "gopls" }, function(_, client)
            if client.server_capabilities.semanticTokensProvider then return end
            local caps = client.config and client.config.capabilities
            local td = caps and caps.textDocument
            local semantic = td and td.semanticTokens
            if not semantic then return end
            client.server_capabilities.semanticTokensProvider = {
              full = true,
              legend = {
                tokenTypes = semantic.tokenTypes,
                tokenModifiers = semantic.tokenModifiers,
              },
              range = true,
            }
          end)
        end,
      },
      servers = {
        -- TypeScript inlay hints (vtsls) — primary language
        vtsls = {
          settings = {
            typescript = {
              inlayHints = {
                parameterNames = { enabled = "all", suppressWhenArgumentMatchesName = true },
                parameterTypes = { enabled = true },
                variableTypes = { enabled = true, suppressWhenTypeMatchesName = true },
                propertyDeclarationTypes = { enabled = true },
                functionLikeReturnTypes = { enabled = true },
                enumMemberValues = { enabled = true },
              },
            },
            javascript = {
              inlayHints = {
                parameterNames = { enabled = "literals" },
                parameterTypes = { enabled = true },
                variableTypes = { enabled = true },
                propertyDeclarationTypes = { enabled = true },
                functionLikeReturnTypes = { enabled = true },
                enumMemberValues = { enabled = true },
              },
            },
          },
        },
      },
    },
  },
}

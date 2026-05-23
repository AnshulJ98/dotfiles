-- Mason: baseline of always-installed formatters/linters.
-- Lang extras pull in language-specific servers; this guarantees the cross-language tools.
return {
  {
    "mason-org/mason.nvim",
    opts = function(_, opts)
      opts.ensure_installed = opts.ensure_installed or {}
      vim.list_extend(opts.ensure_installed, {
        "stylua", -- lua formatter
        "shfmt", -- shell formatter
        "shellcheck", -- shell linter
        "prettierd", -- daemon-mode prettier (faster on save)
        "ruff", -- python linter+formatter (replaces flake8+black+isort)
      })
    end,
  },
}

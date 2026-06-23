# Nvim Lint/Format/LSP Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the kickstart nvim config to parity with the archived LazyVim setup for TS/JS, Python, JSON, YAML, shell, and markdown tooling.

**Architecture:** All tools install via Mason (auto-install on startup). LSP servers register via `vim.lsp.config` + `vim.lsp.enable`. Formatters run through conform.nvim with format-on-save. Linters run through nvim-lint on `BufWritePost`/`InsertLeave`. One new file created (`~/.markdownlint-cli2.yaml`), rest is edits to existing files.

**Tech Stack:** Neovim 0.12+, vim.pack, Mason, conform.nvim, nvim-lint, nvim-dap

## Global Constraints

- Follow existing kickstart patterns (vim.pack.add with `gh()` helper, `do...end` section blocks)
- All tools must auto-install via Mason — no manual `brew install` or `npm install` required
- No new plugin dependencies — only configure tools already available through Mason + existing plugins (conform, nvim-lint, nvim-dap)
- `stylua` remains the Lua formatter; `lua_ls` formatting stays disabled

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `~/.config/nvim/init.lua` | Modify lines 745-822 | Add LSP servers, mason ensure_installed, format-on-save, formatters |
| `~/.config/nvim/init.lua` | Modify lines 190-210 | Add diagnostic toggle keymap |
| `~/.config/nvim/lua/kickstart/plugins/lint.lua` | Modify | Add eslint, ruff, shellcheck linters |
| `~/.config/nvim/lua/kickstart/plugins/debug.lua` | Modify lines 42-45 | Add js-debug-adapter, Node.js DAP config |
| `~/.markdownlint-cli2.yaml` | Create | Set MD013 line length to 120 |

---

### Task 1: LSP Servers

**Files:**
- Modify: `~/.config/nvim/init.lua:745-793` (servers table)

**What changes and why:**

The `servers` table at line 746 currently has only `stylua` and `lua_ls`. We add 5 servers. Each entry in this table gets auto-installed by Mason (line 812-817) and auto-enabled (line 819-822).

- [ ] **Step 1: Add vtsls (TypeScript/JavaScript LSP)**

Replace the commented-out `ts_ls` block (lines 751-756) with `vtsls`. vtsls is what your archived LazyVim used — it's the newer wrapper around VS Code's TypeScript service, faster than ts_ls, and matches your VS Code Insiders behavior.

```lua
-- lines 746-757 become:
local servers = {
    -- TypeScript/JavaScript — vtsls wraps VS Code's TS service (faster than ts_ls)
    vtsls = {
      settings = {
        typescript = {
          inlayHints = {
            parameterNames = { enabled = 'literals', suppressWhenArgumentMatchesName = true },
            parameterTypes = { enabled = true },
            variableTypes = { enabled = true, suppressWhenTypeMatchesName = true },
            propertyDeclarationTypes = { enabled = true },
            functionLikeReturnTypes = { enabled = true },
            enumMemberValues = { enabled = true },
          },
        },
        javascript = {
          inlayHints = {
            parameterNames = { enabled = 'literals' },
            parameterTypes = { enabled = true },
            variableTypes = { enabled = true },
            propertyDeclarationTypes = { enabled = true },
            functionLikeReturnTypes = { enabled = true },
            enumMemberValues = { enabled = true },
          },
        },
      },
    },
```

The inlay hints config matches your archived LazyVim `lsp.lua` and your VS Code Insiders settings (lines 422-427 of VS Code settings.json). Inlay hints show parameter names, return types, and variable types inline — toggle with `<leader>th` (already mapped at init.lua:729).

- [ ] **Step 2: Add basedpyright (Python LSP)**

```lua
    -- Python — basedpyright is the stricter pyright fork your LazyVim archive used
    basedpyright = {},
```

basedpyright over vanilla pyright: stricter defaults, better error messages. Matches your archived `lang.python` LazyVim extra. Your VS Code uses Pylance (Microsoft's closed-source pyright fork) — basedpyright is the open-source equivalent.

- [ ] **Step 3: Add eslint LSP**

```lua
    -- ESLint as LSP server (same approach as VS Code, not nvim-lint)
    eslint = {},
```

Your archived LazyVim used `linting.eslint` extra which runs ESLint as an LSP server, not through nvim-lint. This is the same approach VS Code takes — ESLint runs persistently, gives real-time diagnostics, and supports code actions (auto-fix). We'll ALSO add eslint_d to nvim-lint as a fallback for projects without an ESLint config (Task 3).

- [ ] **Step 4: Add jsonls and yamlls**

```lua
    -- JSON + YAML with schema validation
    jsonls = {},
    yamlls = {},
```

These give you autocomplete and validation in `package.json`, `tsconfig.json`, `.eslintrc.json`, `docker-compose.yml`, GitHub Actions workflows, etc. Your archived LazyVim had both via `lang.json` and `lang.yaml` extras.

- [ ] **Step 5: Keep existing stylua + lua_ls unchanged**

The full `servers` table after all changes:

```lua
local servers = {
    vtsls = { ... },          -- TS/JS (Step 1)
    basedpyright = {},         -- Python (Step 2)
    eslint = {},               -- ESLint as LSP (Step 3)
    jsonls = {},               -- JSON (Step 4)
    yamlls = {},               -- YAML (Step 4)
    stylua = {},               -- (existing) Lua formatter
    lua_ls = { ... },          -- (existing, unchanged)
}
```

---

### Task 2: Mason Ensure Installed

**Files:**
- Modify: `~/.config/nvim/init.lua:812-815` (ensure_installed list)

**What changes and why:**

The `ensure_installed` list (line 812) auto-populates from the `servers` table keys, so LSP servers are covered. But formatters and standalone linters aren't LSP servers — they need to be listed explicitly. Currently the `vim.list_extend` block is empty.

- [ ] **Step 1: Add formatters and linters to ensure_installed**

```lua
-- lines 812-815 become:
local ensure_installed = vim.tbl_keys(servers or {})
vim.list_extend(ensure_installed, {
    'prettierd',   -- JS/TS/JSON/HTML/CSS/MD formatter (daemon, fast)
    'ruff',        -- Python linter + formatter (replaces black/isort/flake8)
    'shfmt',       -- Shell formatter
    'shellcheck',  -- Shell linter
})
```

This matches your archived `mason.lua` which had: `stylua`, `shfmt`, `shellcheck`, `prettierd`, `ruff`. `stylua` is already in the servers table so it's auto-included.

---

### Task 3: Linters (nvim-lint)

**Files:**
- Modify: `~/.config/nvim/lua/kickstart/plugins/lint.lua:6-8` (linters_by_ft table)

**What changes and why:**

Currently only `markdown = { 'markdownlint-cli2' }`. We add linters for the target languages. These run on `BufWritePost` and `InsertLeave` (the autocmd at line 45 already handles this).

Note: ESLint is already running as an LSP (Task 1), so we're NOT adding eslint_d here for JS/TS — that would be redundant. We add ruff for Python and shellcheck for shell.

- [ ] **Step 1: Expand linters_by_ft**

```lua
lint.linters_by_ft = {
    markdown = { 'markdownlint-cli2' },
    python = { 'ruff' },
    sh = { 'shellcheck' },
    bash = { 'shellcheck' },
}
```

Why ruff via nvim-lint AND in Mason: ruff as a linter catches things basedpyright doesn't (style issues, import sorting, complexity). Your archived LazyVim had ruff via the `lang.python` extra for the same reason.

Why no eslint_d here: the ESLint LSP server (Task 1) already provides linting diagnostics in real-time. Running eslint_d through nvim-lint on top of that would double-report every issue.

---

### Task 4: Formatters + Format on Save (conform.nvim)

**Files:**
- Modify: `~/.config/nvim/init.lua:832-858` (conform setup)

**What changes and why:**

The current conform setup has format-on-save disabled (empty `enabled_filetypes` table) and no formatters configured. We flip to enabled-by-default and add formatters for all target languages.

- [ ] **Step 1: Replace the entire conform.setup block**

```lua
require('conform').setup {
    notify_on_error = false,
    format_on_save = function(bufnr)
      -- Disable for filetypes where formatting is unwanted
      local disabled_filetypes = { c = true, cpp = true }
      if disabled_filetypes[vim.bo[bufnr].filetype] then return nil end
      return { timeout_ms = 1000, lsp_format = 'fallback' }
    end,
    default_format_opts = {
      lsp_format = 'fallback',
    },
    formatters_by_ft = {
      javascript = { 'prettierd' },
      javascriptreact = { 'prettierd' },
      typescript = { 'prettierd' },
      typescriptreact = { 'prettierd' },
      json = { 'prettierd' },
      jsonc = { 'prettierd' },
      html = { 'prettierd' },
      css = { 'prettierd' },
      scss = { 'prettierd' },
      markdown = { 'prettierd' },
      yaml = { 'prettierd' },
      python = { 'ruff_organize_imports', 'ruff_format' },
      lua = { 'stylua' },
      sh = { 'shfmt' },
      bash = { 'shfmt' },
    },
  }
```

Key decisions:

- **Format on save flipped to enabled-by-default** with a disabled list, matching your VS Code Insiders (`editor.formatOnSave: true`). Only C/C++ disabled (no formatter configured, avoid LSP formatting surprises).
- **prettierd** (daemon) instead of prettier — faster, stays warm between saves. Matches your archived mason.lua.
- **Python uses `ruff_organize_imports` then `ruff_format`** — sequential, handles import sorting + formatting in one tool. This replaces your VS Code's `black` formatter and is what your archived LazyVim used via the `lang.python` extra. Ruff is a superset of black's formatting.
- **Timeout bumped to 1000ms** — prettierd is fast but first run on a large file can take ~500ms while the daemon starts.
- **`lsp_format = 'fallback'`** means: use the external formatter if one is configured above, otherwise fall back to the LSP's formatter. This means `jsonls` and `yamlls` formatting still works for filetypes not explicitly listed.

---

### Task 5: Markdownlint Config

**Files:**
- Create: `~/.markdownlint-cli2.yaml`

**What changes and why:**

The MD013 line-length warnings are the main noise in your markdown editing. Rather than disabling markdownlint entirely, we bump the line length to 120 (generous enough for prose, still catches runaway lines).

- [ ] **Step 1: Create the config file**

```yaml
# ~/.markdownlint-cli2.yaml
# Global markdownlint config — applies in both nvim and CLI
MD013:
  line_length: 120
  heading_line_length: 80
  code_block_line_length: 120
```

This file is picked up automatically by markdownlint-cli2 — no nvim config changes needed. It applies globally to all projects (project-local `.markdownlint-cli2.yaml` overrides it).

`heading_line_length: 80` is tighter because long headings are a readability problem. `code_block_line_length: 120` matches the prose limit.

---

### Task 6: Diagnostic Toggle Keymap

**Files:**
- Modify: `~/.config/nvim/init.lua:~210` (end of keymaps section, before `end`)

**What changes and why:**

You asked for this earlier. One keymap under the existing `<leader>t` (toggle) group.

- [ ] **Step 1: Add the keymap in the keymaps section**

After the terminal mode keymap (line ~207), before the window navigation keymaps:

```lua
vim.keymap.set('n', '<leader>td', function()
    vim.diagnostic.enable(not vim.diagnostic.is_enabled())
end, { desc = '[T]oggle [D]iagnostics' })
```

Also register it in the which-key spec so it shows up in the `<leader>t` group (line ~374, the which-key spec already has `{ '<leader>t', group = '[T]oggle' }`).

---

### Task 7: DAP — Node.js Debug Support

**Files:**
- Modify: `~/.config/nvim/lua/kickstart/plugins/debug.lua:42-45` (ensure_installed)
- Modify: `~/.config/nvim/lua/kickstart/plugins/debug.lua:88-95` (add Node config after Go)

**What changes and why:**

Currently DAP only has Go (delve). Your archived LazyVim had `dap.core` which supported multi-language debugging. We add `js-debug-adapter` for Node.js debugging.

- [ ] **Step 1: Add js-debug-adapter to mason-nvim-dap ensure_installed**

```lua
-- line 42-45 becomes:
ensure_installed = {
    'delve',
    'js-debug-adapter',
},
```

- [ ] **Step 2: Add Node.js DAP configuration after the Go config**

After `require('dap-go').setup { ... }` (line 89-95), add:

```lua
-- Node.js debug configuration
dap.adapters['pwa-node'] = {
    type = 'server',
    host = 'localhost',
    port = '${port}',
    executable = {
      command = 'node',
      args = {
        vim.fn.stdpath 'data' .. '/mason/packages/js-debug-adapter/js-debug/src/dapDebugServer.js',
        '${port}',
      },
    },
}

dap.configurations.javascript = {
    {
      type = 'pwa-node',
      request = 'launch',
      name = 'Launch current file',
      program = '${file}',
      cwd = '${workspaceFolder}',
    },
}
dap.configurations.typescript = dap.configurations.javascript
```

This gives you `<F5>` to debug the current JS/TS file in Node. The adapter path points to the Mason-installed `js-debug-adapter` package. `pwa-node` is the adapter name used by VS Code's JavaScript Debugger extension — same underlying tool.

---

## Summary of All Changes

| File | Lines changed | What |
|------|--------------|------|
| `init.lua` servers table | ~745-793 | +5 LSP servers (vtsls, basedpyright, eslint, jsonls, yamlls) |
| `init.lua` ensure_installed | ~812-815 | +4 tools (prettierd, ruff, shfmt, shellcheck) |
| `init.lua` conform setup | ~832-858 | Format-on-save enabled, formatters for 12 filetypes |
| `init.lua` keymaps | ~210 | `<leader>td` diagnostic toggle |
| `lint.lua` | ~6-8 | +python (ruff), +sh/bash (shellcheck) |
| `debug.lua` | ~42-45, ~88-95 | +js-debug-adapter, Node.js DAP config |
| `~/.markdownlint-cli2.yaml` | New file | MD013 line length 120 |

**What gets auto-installed by Mason on next startup:** vtsls, basedpyright, eslint, jsonls, yamlls, stylua, lua_ls, prettierd, ruff, shfmt, shellcheck, js-debug-adapter, delve.

**Verification after implementation:** Open nvim, run `:Mason` to confirm all tools install. Open a `.ts` file — should get LSP diagnostics + format on save. Open a `.py` file — should get basedpyright diagnostics + ruff linting + format on save. Open a `.md` file — MD013 should only fire past 120 chars.

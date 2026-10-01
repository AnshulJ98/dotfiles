-- Databases in two layers, replacing the VS Code PostgreSQL extension.
-- vim-dadbod owns connections and runs queries through each database's own
-- CLI (psql, sqlite3, duckdb); vim-dadbod-ui adds the connection tree and
-- saved queries on top of it. dadbod-grip adds the editable result grid:
-- edits stay staged until `gs` shows the SQL and `a` applies it in one
-- transaction. Both take the same connection URLs and grip lists vim-dadbod's
-- g:dbs, so if grip stalls only the grid goes with it.

-- Read once when the plugin loads, so they precede vim.pack.add.
vim.g.db_ui_use_nerd_fonts = 1
vim.g.db_ui_show_database_icon = 1
-- Postgres internals; each entry is a match() pattern, so pg_toast also hides
-- pg_toast_temp_N. Query them directly when needed.
vim.g.db_ui_hide_schemas = { 'information_schema', 'pg_catalog', 'pg_toast', 'pg_temp' }

vim.pack.add {
  'https://github.com/tpope/vim-dadbod',
  'https://github.com/kristijanhusak/vim-dadbod-ui',
  'https://github.com/joryeugene/dadbod-grip.nvim',
}

require('dadbod-grip').setup {
  -- blink.cmp shows grip's table and column source instead (config.completion);
  -- grip's own popup would switch blink off in its query pad.
  completion = false,
  -- AI auto-detects a provider from API keys in the environment and sends it
  -- schema context; this is a work machine, so it stays opt-in.
  ai = false,
  picker = 'telescope',
}

vim.keymap.set('n', '<leader>Du', '<Cmd>DBUIToggle<CR>', { desc = 'Database [U]I: connection tree' })
vim.keymap.set('n', '<leader>Dg', '<Cmd>GripConnect<CR>', { desc = '[G]rip: connect and open the grid' })
vim.keymap.set('n', '<leader>Dq', '<Cmd>GripQuery<CR>', { desc = 'Grip [Q]uery pad' })

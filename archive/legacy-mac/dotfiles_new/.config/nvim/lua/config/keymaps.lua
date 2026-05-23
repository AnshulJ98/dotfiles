-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua

local map = vim.keymap.set

-- ============================================================
-- VSCode-like keybindings (on top of LazyVim defaults)
-- ============================================================

-- Cmd+B equivalent: Toggle file explorer (LazyVim uses <leader>e)
-- Already handled by LazyVim: <leader>e toggles neo-tree

-- Better window navigation
map("n", "<C-h>", "<C-w>h", { desc = "Go to left window" })
map("n", "<C-j>", "<C-w>j", { desc = "Go to lower window" })
map("n", "<C-k>", "<C-w>k", { desc = "Go to upper window" })
map("n", "<C-l>", "<C-w>l", { desc = "Go to right window" })

-- Move lines up/down (Alt+Up/Down like VSCode)
map("n", "<A-j>", "<cmd>m .+1<cr>==", { desc = "Move line down" })
map("n", "<A-k>", "<cmd>m .-2<cr>==", { desc = "Move line up" })
map("i", "<A-j>", "<esc><cmd>m .+1<cr>==gi", { desc = "Move line down" })
map("i", "<A-k>", "<esc><cmd>m .-2<cr>==gi", { desc = "Move line up" })
map("v", "<A-j>", ":m '>+1<cr>gv=gv", { desc = "Move selection down" })
map("v", "<A-k>", ":m '<-2<cr>gv=gv", { desc = "Move selection up" })

-- Duplicate line (Shift+Alt+Down like VSCode)
map("n", "<S-A-j>", "<cmd>t.<cr>", { desc = "Duplicate line down" })
map("n", "<S-A-k>", "<cmd>t.-1<cr>", { desc = "Duplicate line up" })

-- Quick save
map({ "n", "i", "v", "s" }, "<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" })

-- Select all (Cmd+A equivalent)
map("n", "<C-a>", "ggVG", { desc = "Select all" })

-- Better indenting (stay in visual mode)
map("v", "<", "<gv", { desc = "Indent left" })
map("v", ">", ">gv", { desc = "Indent right" })

-- Clear search highlight
map("n", "<Esc>", "<cmd>noh<cr><Esc>", { desc = "Clear highlights" })

-- Terminal keymaps
map("t", "<Esc><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-- Quick terminal (like Ctrl+` in VSCode) — uses Snacks terminal (LazyVim built-in)
map("n", "<C-`>", function() Snacks.terminal() end, { desc = "Toggle terminal" })

-- Open OpenCode in a terminal split
map("n", "<leader>oc", function()
  vim.cmd("botright split | resize 20 | terminal opencode")
  vim.cmd("startinsert")
end, { desc = "Open OpenCode" })

-- Open Claude Code in a terminal split
map("n", "<leader>cc", function()
  vim.cmd("botright split | resize 20 | terminal claude")
  vim.cmd("startinsert")
end, { desc = "Open Claude Code" })

-- Quick format (already in LazyVim as <leader>cf)

-- Close buffer (Cmd+W equivalent)
-- Already in LazyVim as <leader>bd

-- Navigate buffers (Ctrl+Tab like VSCode)
map("n", "<S-h>", "<cmd>bprevious<cr>", { desc = "Prev buffer" })
map("n", "<S-l>", "<cmd>bnext<cr>", { desc = "Next buffer" })

-- Centered scrolling
map("n", "<C-d>", "<C-d>zz", { desc = "Scroll down (centered)" })
map("n", "<C-u>", "<C-u>zz", { desc = "Scroll up (centered)" })

-- Keep cursor centered during search
map("n", "n", "nzzzv", { desc = "Next search result (centered)" })
map("n", "N", "Nzzzv", { desc = "Prev search result (centered)" })

-- Paste without overwriting register in visual mode
map("v", "p", '"_dP', { desc = "Paste without yanking" })

-- Quick access to system clipboard
map({ "n", "v" }, "<leader>y", '"+y', { desc = "Yank to system clipboard" })

-- Split management
map("n", "<leader>wv", "<cmd>vsplit<cr>", { desc = "Split vertical" })
map("n", "<leader>ws", "<cmd>split<cr>", { desc = "Split horizontal" })
map("n", "<leader>wq", "<cmd>close<cr>", { desc = "Close split" })

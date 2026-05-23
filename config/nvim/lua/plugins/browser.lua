-- Browser integration: live preview, URL handling, and web search

return {
  -- Live preview: auto-refreshing browser preview for HTML/CSS/JS files
  {
    "brianhuster/live-preview.nvim",
    cmd = { "LivePreview" },
    keys = {
      { "<leader>lp", "<cmd>LivePreview start<cr>", desc = "Live Preview: Start" },
      { "<leader>ls", "<cmd>LivePreview close<cr>", desc = "Live Preview: Stop" },
      { "<leader>lf", "<cmd>LivePreview pick<cr>", desc = "Live Preview: Pick File" },
    },
    opts = {
      browser = "default",
      dynamic_root = true,
    },
  },

  -- Browse.nvim: search the web and open DevDocs from within Neovim
  {
    "lalitmee/browse.nvim",
    dependencies = { "nvim-telescope/telescope.nvim" },
    cmd = { "Browse" },
    keys = {
      {
        "<leader>ow",
        function()
          require("browse").input_search()
        end,
        desc = "Open: Web Search",
      },
      {
        "<leader>od",
        function()
          require("browse.devdocs").search()
        end,
        desc = "Open: DevDocs Search",
      },
    },
    opts = {
      provider = "google",
    },
  },

  -- url-open: highlight and open URLs in buffers
  {
    "sontungexpt/url-open",
    event = "BufReadPost",
    cmd = "URLOpenUnderCursor",
    keys = {
      {
        "gx",
        "<cmd>URLOpenUnderCursor<cr>",
        desc = "Open URL under cursor",
      },
    },
    opts = {
      highlight_url = {
        all_urls = {
          enabled = true,
          fg = "#44ddff", -- Theme cyan for URL highlights
          underline = true,
        },
      },
      open_only_when_cursor_on_url = false,
    },
  },
}

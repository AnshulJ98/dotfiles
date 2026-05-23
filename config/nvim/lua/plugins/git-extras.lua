-- Git extras: enhanced diff viewer with file tree panel

return {
  -- Diffview: side-by-side diffs and file history browser
  {
    "sindrets/diffview.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    cmd = { "DiffviewOpen", "DiffviewFileHistory", "DiffviewClose" },
    keys = {
      { "<leader>gd", "<cmd>DiffviewOpen<cr>", desc = "Diffview: Open Diff" },
      { "<leader>gh", "<cmd>DiffviewFileHistory %<cr>", desc = "Diffview: File History" },
      { "<leader>gD", "<cmd>DiffviewClose<cr>", desc = "Diffview: Close" },
    },
    opts = {
      enhanced_diff_hl = true,
      view = {
        default = {
          layout = "diff2_horizontal",
          winbar_info = true,
        },
        merge_tool = {
          layout = "diff3_horizontal",
          disable_diagnostics = true,
        },
        file_history = {
          layout = "diff2_horizontal",
          winbar_info = true,
        },
      },
      file_panel = {
        listing_style = "tree",
        tree_options = {
          flatten_dirs = true,
          folder_statuses = "only_folded",
        },
        win_config = {
          position = "left",
          width = 35,
        },
      },
      -- Diff highlights are handled by the bearded-monokai colorscheme
    },
  },
}

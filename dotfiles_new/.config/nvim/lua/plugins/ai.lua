-- AI integration: GitHub Copilot Chat + OpenCode + Claude Code terminal access
-- No ghost-text / inline AI completions — LSP-only completions
-- AI chat via CopilotChat, terminal access to OpenCode and Claude Code

return {
  -- GitHub Copilot: core engine (ghost text disabled, used as backend for CopilotChat)
  {
    "zbirenbaum/copilot.lua",
    cmd = "Copilot",
    event = "InsertEnter",
    opts = {
      suggestion = { enabled = false }, -- No ghost text / inline completions
      panel = { enabled = false },      -- No suggestion panel
      filetypes = {
        ["*"] = true,
      },
    },
  },

  -- CopilotChat: AI chat panel powered by GitHub Copilot
  {
    "CopilotC-Nvim/CopilotChat.nvim",
    dependencies = {
      "zbirenbaum/copilot.lua",
      "nvim-lua/plenary.nvim",
    },
    cmd = {
      "CopilotChat",
      "CopilotChatOpen",
      "CopilotChatToggle",
      "CopilotChatExplain",
      "CopilotChatReview",
      "CopilotChatFix",
      "CopilotChatOptimize",
      "CopilotChatDocs",
      "CopilotChatTests",
    },
    keys = {
      { "<leader>aa", "<cmd>CopilotChatToggle<cr>", desc = "Copilot: Toggle Chat", mode = { "n", "v" } },
      { "<leader>ae", "<cmd>CopilotChatExplain<cr>", desc = "Copilot: Explain", mode = { "n", "v" } },
      { "<leader>ar", "<cmd>CopilotChatReview<cr>", desc = "Copilot: Review", mode = { "n", "v" } },
      { "<leader>af", "<cmd>CopilotChatFix<cr>", desc = "Copilot: Fix", mode = { "n", "v" } },
      { "<leader>ao", "<cmd>CopilotChatOptimize<cr>", desc = "Copilot: Optimize", mode = { "n", "v" } },
      { "<leader>at", "<cmd>CopilotChatTests<cr>", desc = "Copilot: Generate Tests", mode = { "n", "v" } },
      { "<leader>ad", "<cmd>CopilotChatDocs<cr>", desc = "Copilot: Generate Docs", mode = { "n", "v" } },
      {
        "<leader>aq",
        function()
          vim.ui.input({ prompt = "Copilot: " }, function(input)
            if input and input ~= "" then
              vim.cmd("CopilotChat " .. input)
            end
          end)
        end,
        desc = "Copilot: Quick Chat",
        mode = { "n", "v" },
      },
    },
    opts = {
      model = "claude-3.5-sonnet", -- or "gpt-4o", whichever you prefer
      window = {
        layout = "vertical",
        width = 0.3,
      },
    },
  },
}

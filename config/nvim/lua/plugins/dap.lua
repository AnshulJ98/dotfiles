-- DAP: themed sign icons + rounded UI. LazyVim's dap.core handles keymaps & adapters.
return {
  {
    "mfussenegger/nvim-dap",
    init = function()
      vim.fn.sign_define("DapBreakpoint", { text = "●", texthl = "DiagnosticError", numhl = "DiagnosticError" })
      vim.fn.sign_define("DapBreakpointCondition", { text = "◆", texthl = "DiagnosticWarn", numhl = "DiagnosticWarn" })
      vim.fn.sign_define("DapLogPoint", { text = "◉", texthl = "DiagnosticInfo", numhl = "DiagnosticInfo" })
      vim.fn.sign_define("DapStopped", { text = "▶", texthl = "DiagnosticOk", linehl = "Visual", numhl = "DiagnosticOk" })
      vim.fn.sign_define("DapBreakpointRejected", { text = "✖", texthl = "DiagnosticError", numhl = "DiagnosticError" })
    end,
  },
  {
    "rcarriga/nvim-dap-ui",
    opts = {
      floating = { border = "rounded" },
      icons = { expanded = "▾", collapsed = "▸", current_frame = "▶" },
      controls = {
        icons = {
          pause = "⏸",
          play = "▶",
          step_into = "⏎",
          step_over = "⏭",
          step_out = "⏮",
          step_back = "↩",
          run_last = "↻",
          terminate = "⏹",
          disconnect = "⏏",
        },
      },
    },
  },
}

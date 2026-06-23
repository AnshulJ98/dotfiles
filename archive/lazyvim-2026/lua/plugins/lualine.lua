-- Lualine: add macro recording + active LSP server indicators
return {
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      -- Macro recording indicator (high-priority, front of lualine_x)
      table.insert(opts.sections.lualine_x, 1, {
        function()
          local reg = vim.fn.reg_recording()
          return reg ~= "" and ("rec @" .. reg) or ""
        end,
        cond = function() return vim.fn.reg_recording() ~= "" end,
        color = { fg = "#ff3377", gui = "bold" },
      })

      -- Active LSP server names
      table.insert(opts.sections.lualine_x, {
        function()
          local clients = vim.lsp.get_clients({ bufnr = 0 })
          if #clients == 0 then return "" end
          local names = {}
          for _, c in ipairs(clients) do
            if c.name ~= "copilot" and c.name ~= "null-ls" then
              names[#names + 1] = c.name
            end
          end
          return table.concat(names, " ")
        end,
        icon = " ",
        cond = function() return #vim.lsp.get_clients({ bufnr = 0 }) > 0 end,
        color = { fg = "#88ff44" },
      })

      return opts
    end,
  },
}

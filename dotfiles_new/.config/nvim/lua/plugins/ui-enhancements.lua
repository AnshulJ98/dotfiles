-- UI enhancements: rainbow delimiters, color previews, and indent guides
-- All colors are tuned to the bearded-monokai theme palette

return {
  -- Rainbow delimiters: colorful matching brackets/parens using treesitter
  {
    "HiPhish/rainbow-delimiters.nvim",
    event = "BufReadPost",
    config = function()
      local rainbow = require("rainbow-delimiters")

      -- Define highlight groups with bearded-monokai bracket colors
      vim.api.nvim_set_hl(0, "RainbowDelimiterYellow", { fg = "#ffee00" })
      vim.api.nvim_set_hl(0, "RainbowDelimiterMagenta", { fg = "#ff44ff" })
      vim.api.nvim_set_hl(0, "RainbowDelimiterCyan", { fg = "#44ddff" })
      vim.api.nvim_set_hl(0, "RainbowDelimiterPurple", { fg = "#cc88ff" })
      vim.api.nvim_set_hl(0, "RainbowDelimiterTeal", { fg = "#44ffcc" })
      vim.api.nvim_set_hl(0, "RainbowDelimiterPink", { fg = "#ff3377" })

      ---@type rainbow_delimiters.config
      vim.g.rainbow_delimiters = {
        strategy = {
          [""] = rainbow.strategy["global"],
        },
        query = {
          [""] = "rainbow-delimiters",
        },
        highlight = {
          "RainbowDelimiterYellow",
          "RainbowDelimiterMagenta",
          "RainbowDelimiterCyan",
          "RainbowDelimiterPurple",
          "RainbowDelimiterTeal",
          "RainbowDelimiterPink",
        },
      }
    end,
  },

  -- Colorizer: inline color previews for hex codes, CSS colors, tailwind classes
  {
    "NvChad/nvim-colorizer.lua",
    event = "BufReadPost",
    opts = {
      filetypes = { "*" },
      user_default_options = {
        mode = "background",
        css = true,
        css_fn = true,
        tailwind = true,
        rgb_fn = true,
        hsl_fn = true,
        names = false, -- Disable named colors ("red", "blue") to reduce noise
        always_update = true,
      },
    },
  },

  -- Indent blankline: rainbow indent guides matching the theme bracket palette
  {
    "lukas-reineke/indent-blankline.nvim",
    main = "ibl",
    event = "BufReadPost",
    opts = function(_, opts)
      -- Define rainbow indent highlight groups using bearded-monokai colors (dimmed for subtlety)
      local indent_highlights = {
        "IndentRainbowYellow",
        "IndentRainbowMagenta",
        "IndentRainbowCyan",
        "IndentRainbowPurple",
        "IndentRainbowTeal",
        "IndentRainbowPink",
      }

      local hooks = require("ibl.hooks")

      hooks.register(hooks.type.HIGHLIGHT_SETUP, function()
        -- Use lower alpha / blended colors so indent guides are visible but not distracting
        vim.api.nvim_set_hl(0, "IndentRainbowYellow", { fg = "#3d3900" })
        vim.api.nvim_set_hl(0, "IndentRainbowMagenta", { fg = "#3d103d" })
        vim.api.nvim_set_hl(0, "IndentRainbowCyan", { fg = "#10353d" })
        vim.api.nvim_set_hl(0, "IndentRainbowPurple", { fg = "#31213d" })
        vim.api.nvim_set_hl(0, "IndentRainbowTeal", { fg = "#103d31" })
        vim.api.nvim_set_hl(0, "IndentRainbowPink", { fg = "#3d0d1c" })
        -- Scope highlight: brighter to stand out
        vim.api.nvim_set_hl(0, "IndentScope", { fg = "#545454" })
      end)

      opts.indent = opts.indent or {}
      opts.indent.highlight = indent_highlights
      opts.indent.char = "|"

      opts.scope = opts.scope or {}
      opts.scope.enabled = true
      opts.scope.highlight = "IndentScope"
      opts.scope.show_start = true
      opts.scope.show_end = false

      opts.exclude = opts.exclude or {}
      opts.exclude.filetypes = {
        "help",
        "dashboard",
        "neo-tree",
        "Trouble",
        "lazy",
        "mason",
        "notify",
        "toggleterm",
        "lazyterm",
      }

      return opts
    end,
  },
}

-- Editor extras: PDF viewing, image rendering, markdown enhancements, table mode

return {
  -- Image.nvim: inline image rendering in terminal (kitty graphics protocol / WezTerm)
  -- Requires: brew install imagemagick luarocks && luarocks install magick
  {
    "3rd/image.nvim",
    ft = { "markdown", "norg", "org" },
    cond = function()
      return vim.fn.executable("magick") == 1
    end,
    opts = {
      backend = "kitty",
      max_width = 100,
      max_height = 12,
      max_width_window_percentage = math.huge,
      max_height_window_percentage = math.huge,
      window_overlap_clear_enabled = true,
      window_overlap_clear_ft_ignore = { "cmp_menu", "cmp_docs", "" },
      integrations = {
        markdown = {
          enabled = true,
          clear_in_insert_mode = true,
          download_remote_images = true,
          only_render_image_at_cursor = false,
          filetypes = { "markdown" },
        },
      },
    },
  },

  -- Render-markdown: extend LazyVim's markdown rendering with theme-colored headings
  {
    "MeanderingProgrammer/render-markdown.nvim",
    ft = { "markdown" },
    opts = function(_, opts)
      -- Apply bearded-monokai heading colors
      vim.api.nvim_set_hl(0, "RenderMarkdownH1Bg", { bg = "#2a2200", fg = "#ffee00", bold = true })
      vim.api.nvim_set_hl(0, "RenderMarkdownH2Bg", { bg = "#1a0033", fg = "#cc88ff", bold = true })
      vim.api.nvim_set_hl(0, "RenderMarkdownH3Bg", { bg = "#0d2a33", fg = "#44ddff", bold = true })
      vim.api.nvim_set_hl(0, "RenderMarkdownH4Bg", { bg = "#0d331a", fg = "#66ff88", bold = true })
      vim.api.nvim_set_hl(0, "RenderMarkdownH5Bg", { bg = "#330d1a", fg = "#ff3377", bold = true })
      vim.api.nvim_set_hl(0, "RenderMarkdownH6Bg", { bg = "#33200d", fg = "#ff8844", bold = true })

      opts.heading = opts.heading or {}
      opts.heading.backgrounds = {
        "RenderMarkdownH1Bg",
        "RenderMarkdownH2Bg",
        "RenderMarkdownH3Bg",
        "RenderMarkdownH4Bg",
        "RenderMarkdownH5Bg",
        "RenderMarkdownH6Bg",
      }

      opts.checkbox = opts.checkbox or {}
      opts.checkbox.enabled = true

      opts.pipe_table = opts.pipe_table or {}
      opts.pipe_table.enabled = true
      opts.pipe_table.style = "full"

      opts.code = opts.code or {}
      opts.code.enabled = true
      opts.code.style = "full"
      opts.code.border = "thin"

      return opts
    end,
  },

  -- Table mode: easily create and format markdown tables
  {
    "dhruvasagar/vim-table-mode",
    ft = { "markdown" },
    cmd = { "TableModeToggle", "TableModeEnable", "TableModeDisable" },
    init = function()
      vim.g.table_mode_corner = "|"
      vim.g.table_mode_header_fillchar = "-"
    end,
  },
}

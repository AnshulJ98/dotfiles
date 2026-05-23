return {
  -- Monokai Pro – Best modern Monokai port (multiple filters, black bg support)
  {
    "loctvl842/monokai-pro.nvim",
    priority = 1000, -- Load early to avoid flash
  },

  -- Activate as default
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "monokai-pro", -- Base filter (classic with dark/black bg)
    },
  },

  -- Optional: Customize for true black background (like Bearded Monokai Black)
  {
    "monokai-pro.nvim",
    opts = {
      transparent_background = true,
      transparent = true,
      transparent_mode = true,
      float = {
        transparent = true,
      },
      background_clear = {}, -- Clear default bg if needed
      filter = "classic", -- Or "ristretto" for darker variants
      styles = {
        sidebars = "transparent",
        floats = "transparent",
      },
    },
  },
}

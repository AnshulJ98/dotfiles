-- Fix: refactoring.nvim now requires lewis6991/async.nvim (not bundled in plenary)
-- LazyVim's extras/editor/refactoring.lua spec is behind on this dep.
return {
  {
    "ThePrimeagen/refactoring.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-treesitter/nvim-treesitter",
      "lewis6991/async.nvim",
    },
  },
}

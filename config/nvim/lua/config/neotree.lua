vim.pack.add {
  { src = 'https://github.com/nvim-neo-tree/neo-tree.nvim', version = vim.version.range '*' },
  'https://github.com/MunifTanjim/nui.nvim',
}

-- Configured at startup, not on the first \: `nvim .` opens the tree through
-- neo-tree's netrw hijack before any keypress, and a lazy setup left that tree
-- on the defaults (no folder icons, glyph git marks, no watcher). Setup costs
-- 0.3ms.
local file_icon = require('neo-tree.defaults').default_component_configs.icon.provider
require('neo-tree').setup {
  default_component_configs = {
    icon = {
      -- neo-tree's provider icons files only, so every folder was the
      -- same yellow glyph. A folder mini.icons knows (config.mini) gets
      -- its glyph and colour while collapsed; open, it keeps the open
      -- folder glyph in that colour, so open and closed stay distinct.
      provider = function(icon, node, state)
        if node.type ~= 'directory' then return file_icon(icon, node, state) end
        local glyph, highlight, is_default = MiniIcons.get('directory', node.name)
        if is_default then return end
        icon.highlight = highlight
        if not node:is_expanded() then icon.text = glyph end
      end,
    },
    -- VS Code's letters in place of neo-tree's glyph pairs, where a
    -- second glyph (the 󰄱 box) said staged or unstaged. The letter keeps
    -- its git colour; the staged state is left to the CodeDiff explorer.
    git_status = {
      symbols = {
        added = 'A',
        modified = 'M',
        deleted = 'D',
        renamed = 'R',
        untracked = 'U',
        conflict = '!',
        ignored = '',
        staged = '',
        unstaged = '',
      },
    },
  },
  filesystem = {
    -- The default refreshes only when nvim itself writes a file, so a
    -- file created by a formatter, an agent or a shell stayed missing
    -- until a manual refresh. The OS watcher covers the expanded
    -- directories, hidden ones included.
    use_libuv_file_watcher = true,
    window = {
      mappings = {
        ['\\'] = 'close_window',
      },
    },
  },
}
vim.keymap.set('n', '\\', function() vim.cmd.Neotree 'reveal' end, { desc = 'NeoTree reveal', silent = true })

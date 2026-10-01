-- mini.icons mocks nvim-web-devicons, which telescope and neo-tree resolve
-- on first use, so this module loads before either of them.

vim.pack.add { 'https://github.com/nvim-mini/mini.nvim' }

-- Folders mini.icons has no icon for, from the TypeScript projects; each is a
-- Material Design folder glyph, as VS Code's material-icon-theme draws them.
-- mini.icons already covers src, test, tests, docs, bin, build, lib and
-- node_modules.
require('mini.icons').setup {
  directory = {
    __tests__ = { glyph = '󱞊', hl = 'MiniIconsBlue' },
    assets = { glyph = '󰉏', hl = 'MiniIconsYellow' },
    config = { glyph = '󱁿', hl = 'MiniIconsCyan' },
    coverage = { glyph = '󱥾', hl = 'MiniIconsGrey' },
    dist = { glyph = '󰛫', hl = 'MiniIconsGrey' },
    e2e = { glyph = '󱞊', hl = 'MiniIconsBlue' },
    migrations = { glyph = '󰴋', hl = 'MiniIconsCyan' },
    modules = { glyph = '󰉓', hl = 'MiniIconsPurple' },
    prisma = { glyph = '󱋣', hl = 'MiniIconsCyan' },
    public = { glyph = '󰉏', hl = 'MiniIconsYellow' },
    scripts = { glyph = '󱧺', hl = 'MiniIconsYellow' },
    utils = { glyph = '󱧼', hl = 'MiniIconsYellow' },
  },
}
-- Used for backwards compatibility with plugins that require `nvim-web-devicons` (e.g. telescope.nvim)
MiniIcons.mock_nvim_web_devicons()

require('mini.ai').setup {
  -- nvim 0.12 added built-in v_an/v_in for treesitter node selection, which
  -- conflicts with mini.ai's around_next/inside_next defaults. Remapped here
  -- to avoid the collision. See kickstart.nvim #1971. Not to kickstart's
  -- aa/ii: `a` is mini.ai's built-in argument textobject, so `aa` swallowed
  -- `daa` (delete an argument with its comma) as "around next".
  mappings = {
    around_next = 'aN',
    inside_next = 'iN',
  },
  n_lines = 500,
}

require('mini.surround').setup()

-- Scroll only: kitty's cursor_trail already animates the cursor. Scrolls of up
-- to 3 lines (one wheel notch at 'mousescroll' ver:3, `j`/`k` against
-- 'scrolloff') stay instant. Steps are capped at 10 ms, under the 30 ms macOS
-- key repeat, so a held key never scrolls from a half-finished view (`:h
-- MiniAnimate.config.scroll`); long jumps still take 150 ms in total.
local animate = require 'mini.animate'
animate.setup {
  cursor = { enable = false },
  scroll = {
    timing = function(_, n) return math.min(150 / n, 10) end,
    subscroll = animate.gen_subscroll.equal { predicate = function(total_scroll) return total_scroll > 3 end },
  },
  resize = { enable = false },
  open = { enable = false },
  close = { enable = false },
}

local statusline = require 'mini.statusline'
statusline.setup { use_icons = true }

---@diagnostic disable-next-line: duplicate-set-field
statusline.section_location = function() return '%2l:%-2v %P' end

-- `parent/file` instead of the full path: a hashed checkout directory pushed
-- the name off the line. Special buffers (terminal, panels) keep their name.
---@diagnostic disable-next-line: duplicate-set-field
statusline.section_filename = function()
  if vim.bo.buftype ~= '' then return '%t%( %M%)' end
  local name = vim.api.nvim_buf_get_name(0)
  if name == '' then return '[No Name]%( %M%)' end
  return vim.fn.fnamemodify(name, ':h:t') .. '/' .. vim.fn.fnamemodify(name, ':t') .. '%( %M%R%)'
end

-- Attached LSP client names, then the debugger's state (`Stopped at line
-- 16`, `Running`) while a session exists. dap.status() keeps returning the
-- last progress message after the session ends, hence the session guard.
---@diagnostic disable-next-line: duplicate-set-field
statusline.section_lsp = function()
  local parts = {}
  for _, c in ipairs(vim.lsp.get_clients { bufnr = 0 }) do
    parts[#parts + 1] = c.name
  end
  local text = #parts > 0 and (' ' .. table.concat(parts, ' ')) or ''
  local dap = package.loaded.dap
  if dap and dap.session() then text = text .. '  ' .. dap.status():gsub('%%', '%%%%') end
  return text
end

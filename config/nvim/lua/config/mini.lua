-- mini.icons mocks nvim-web-devicons, which telescope and neo-tree resolve
-- on first use, so this module loads before either of them.

vim.pack.add { 'https://github.com/nvim-mini/mini.nvim' }

require('mini.icons').setup()
-- Used for backwards compatibility with plugins that require `nvim-web-devicons` (e.g. telescope.nvim)
MiniIcons.mock_nvim_web_devicons()

require('mini.ai').setup {
  -- nvim 0.12 added built-in v_an/v_in for treesitter node selection, which
  -- conflicts with mini.ai's around_next/inside_next defaults. Remapped here
  -- to avoid the collision. See kickstart.nvim #1971.
  -- aa/ii may shadow mini.ai custom textobjects (around-argument, inside-indent)
  -- if you add those later — pick different keys at that point.
  mappings = {
    around_next = 'aa',
    inside_next = 'ii',
  },
  n_lines = 500,
}

require('mini.surround').setup()

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

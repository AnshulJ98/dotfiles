-- Per-window breadcrumbs, VS Code's breadcrumbs bar. The global statusline
-- names only the focused window's file; this names every split's file and the
-- symbol under the cursor. Icons come through config.mini's devicons mock.

vim.pack.add { 'https://github.com/Bekaboo/dropbar.nvim' }

-- Upstream bug: a click on a menu's border ('winborder' is rounded) reaches
-- click_at with getmousepos().line == 0 and nvim_win_set_cursor raises E5108
-- "Invalid cursor line: out of range" (dropbar/menu.lua:315). Border clicks
-- are dropped; every other click goes to upstream's handler unchanged.
local upstream_click = require('dropbar.configs').opts.menu.keymaps['<LeftMouse>']
require('dropbar').setup {
  -- No `i`: <leader>; claims it for fuzzy find (below).
  bar = { pick = { pivots = 'abcdefghjklmnopqrstuvwxyz' } },
  menu = {
    keymaps = {
      ['<LeftMouse>'] = function()
        local mouse = vim.fn.getmousepos()
        if require('dropbar.utils').menu.get { win = mouse.winid } and mouse.line == 0 then return end
        upstream_click()
      end,
    },
  },
}

local dropbar_api = require 'dropbar.api'
-- Kinds whose sibling list is worth searching. The literal innermost crumb is
-- often a `return` or an object key whose menu holds one entry.
local outline_kinds = {
  DropBarKindClass = true,
  DropBarKindConstructor = true,
  DropBarKindEnum = true,
  DropBarKindFunction = true,
  DropBarKindInterface = true,
  DropBarKindMethod = true,
  DropBarKindModule = true,
  DropBarKindNamespace = true,
  DropBarKindStruct = true,
}

-- Pick mode reads its key with getchar(), so `i` is caught with on_key: it
-- opens the menu of the innermost enclosing function, method or class (its
-- siblings) straight into fuzzy find, where upstream needs a pick and then `i`.
-- With no such crumb it falls back to the last one.
local function pick_or_fuzzy_find()
  local key
  local ns = vim.on_key(function(_, typed) key = key or typed end)
  local ok, err = pcall(dropbar_api.pick)
  vim.on_key(nil, ns)
  if not ok then error(err) end
  if key ~= 'i' then return end
  local bar = require('dropbar.utils').bar.get_current()
  if not bar then return end
  local target = #bar.components
  for index = #bar.components, 1, -1 do
    if outline_kinds[bar.components[index].name_hl] then
      target = index
      break
    end
  end
  dropbar_api.pick(target)
  local menu = require('dropbar.utils').menu.get_current()
  if menu then menu:fuzzy_find_open() end
end
vim.keymap.set('n', '<leader>;', pick_or_fuzzy_find, { desc = 'Pick breadcrumb (i: fuzzy find symbols)' })
vim.keymap.set('n', '[;', dropbar_api.goto_context_start, { desc = 'Go to start of current context' })
vim.keymap.set('n', '];', dropbar_api.select_next_context, { desc = 'Select next context' })

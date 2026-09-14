-- Variable inspection through nvim-dap's own widgets: the scopes and stacks
-- floats, and evaluation of the expression under the cursor.

local dap = require 'dap'
local widgets = require 'dap.ui.widgets'

local M = {}

-- nvim-dap's widget floats carry no syntax colours of their own, so evaluated
-- values are parsed as javascript, as the old dap-ui float did. The frames
-- float is file paths and stays plain.
local function highlight_values(view)
  pcall(vim.treesitter.start, vim.api.nvim_win_get_buf(view.win), 'javascript')
  return view
end

-- The expression the cursor is on: the whole `a.b[0].c` chain, not the one
-- identifier `<cexpr>` would return.
---@return string
function M.expr_under_cursor()
  -- get_node raises when the buffer has no parser rather than returning nil.
  local ok, node = pcall(vim.treesitter.get_node)
  if not (ok and node) then return vim.fn.expand '<cexpr>' end
  while node:parent() and vim.tbl_contains({ 'member_expression', 'subscript_expression' }, node:parent():type()) do
    node = node:parent()
  end
  return vim.treesitter.get_node_text(node, 0)
end

-- nvim-dap renders a variable as `name: value` with nothing to show that it
-- can be opened, while the dap-view panel prefixes a chevron. The float now
-- prefixes the same two icons, for the same reason and with the same
-- alignment (no padding on leaves).
--
-- Which way the chevron points has to be tracked here: `is_expanded` is a
-- closure local inside `dap.ui.new_tree` (dap/ui.lua:164) and the tree only
-- exposes `toggle` and `render`. The wrapper below is the single funnel for
-- every expand and collapse, because `new_tree` reads `tree.toggle` out of
-- the table when it builds each line's action list, so replacing it before
-- the first render is enough. Keys are the same ancestor chain `new_tree`
-- itself keys expansion by (`__parent.key`, set on every node that has
-- children), and the map is born and discarded with the tree, so the two
-- cannot drift across a re-render, a step, or a reopened float.
local chevron = { expanded = '󰅀 ', collapsed = '󰅂 ' }

local function variable_path(var)
  local keys = { var.name or var.result }
  local parent = var.__parent
  while parent do
    table.insert(keys, parent.key)
    parent = parent.__parent
  end
  return table.concat(keys, '\0')
end

-- Prepend to a rendered line and move its highlight columns with it, the way
-- dap/ui.lua's private `with_indent` does for the indent.
local function prefixed(prefix, text, regions)
  local shifted = {}
  for i, region in ipairs(regions or {}) do
    shifted[i] = { region[1], region[2] + #prefix, region[3] == -1 and -1 or region[3] + #prefix }
  end
  return prefix .. text, shifted
end

-- `dap.ui.widgets.scopes` hands each scope root to `dap.ui.new_tree`'s
-- render, which force-expands whatever it is given (dap/ui.lua: `if not
-- is_expanded(value) then set_expanded(value, {}) end`). One of those roots
-- is js-debug's `Global`, several hundred entries deep, and it buried the
-- locals. Adapters mark such a scope `expensive`; dap-view drops those and
-- so does this float. Everything else is the stock widget, so the collapse
-- state in `view.tree` and the refresh listener are untouched.
local cheap_scopes = vim.tbl_extend('force', widgets.scopes, {
  render = function(view)
    local session = dap.session()
    local frame = session and session.current_frame or {}
    if not view.tree then
      local ui = require 'dap.ui'
      local spec = vim.deepcopy(require('dap.entity').scope.tree_spec)
      spec.extra_context = { view = view }
      local expanded_paths = {}
      local render_child = spec.render_child
      spec.render_child = function(var)
        local text, regions = render_child(var)
        if not spec.has_children(var) then return text, regions end
        return prefixed(expanded_paths[variable_path(var)] and chevron.expanded or chevron.collapsed, text, regions)
      end
      local tree = ui.new_tree(spec)
      local toggle = tree.toggle
      tree.toggle = function(layer, value, lnum, context)
        toggle(layer, value, lnum, context)
        if not spec.has_children(value) then return end
        local path = variable_path(value)
        if expanded_paths[path] then
          -- `collapse` in dap/ui.lua drops the expansion state of every
          -- descendant, not just the node, so this map has to follow it or a
          -- re-expand shows open chevrons over nothing. A descendant's path
          -- ends with its ancestor's.
          local suffix = '\0' .. path
          for other in pairs(expanded_paths) do
            if other == path or vim.endswith(other, suffix) then expanded_paths[other] = nil end
          end
        else
          expanded_paths[path] = true
        end
        -- Re-render the node's own line in place. `toggle` only touches the
        -- lines below it, so the chevron up here is still the stale one, and
        -- a whole-view refresh would race the children it is still fetching.
        local indent = string.rep(' ', context.indent)
        layer.render({ value }, function(v) return prefixed(indent, spec.render_child(v)) end, context, lnum, lnum + 1)
      end
      view.tree = tree
    end
    local scopes = {}
    for _, scope in ipairs(frame.scopes or {}) do
      if not scope.expensive then scopes[#scopes + 1] = scope end
    end
    local layer = view.layer()
    local render
    render = function(index)
      local scope = scopes[index]
      if not scope then return end
      local replace = index == 1
      -- Only the first scope replaces the buffer; the rest append, and each
      -- waits for its predecessor because the children arrive over DAP.
      view.tree.render(layer, scope, function() render(index + 1) end, replace and 0 or nil, replace and -1 or nil)
    end
    render(1)
  end,
})

-- Floats for the two trees nvim-dap owns (scopes, stacks); pane jumps for the
-- sections that exist only in dap-view (watches, REPL).
vim.keymap.set('n', '<leader>df', function() highlight_values(widgets.centered_float(cheap_scopes)) end, { desc = 'Debug: [F]loat scopes' })
vim.keymap.set('n', '<leader>dk', function() widgets.centered_float(widgets.frames) end, { desc = 'Debug: stac[K]s float' })
-- Evaluates the selection in visual mode and the expression under the cursor
-- in normal mode, with no prompt (widgets.hover checks the mode before it
-- calls the function it is given).
vim.keymap.set({ 'n', 'v' }, '<leader>de', function() highlight_values(widgets.hover(M.expr_under_cursor)) end, { desc = 'Debug: [E]val expression' })

-- nvim-dap's widget floats map <CR>/o to expand and nothing to close.
vim.api.nvim_create_autocmd('FileType', {
  group = vim.api.nvim_create_augroup('dap_float_close', { clear = true }),
  pattern = 'dap-float',
  callback = function(args) vim.keymap.set('n', 'q', '<cmd>close<CR>', { buffer = args.buf, desc = 'Close' }) end,
})

return M

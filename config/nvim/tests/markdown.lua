-- Real installed renderer and parser; no servers or network.
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/config/nvim')
dofile 'config/nvim/lua/config/markdown.lua'
local lines = { '# Demo', '', '```bash', 'echo hello', '```', '', 'Cursor stays outside the fence.' }
vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
vim.api.nvim_win_set_cursor(0, { #lines, 0 })
vim.bo.filetype = 'markdown'
vim.treesitter.start(0, 'markdown')
require('render-markdown').enable()
local function marks()
  local result = {}
  for _, id in pairs(vim.api.nvim_get_namespaces()) do
    for _, mark in ipairs(vim.api.nvim_buf_get_extmarks(0, id, 0, -1, { details = true })) do
      if mark[2] == 2 then result[#result + 1] = mark end
    end
  end
  return result
end
assert(vim.wait(2000, function() vim.cmd.redraw(); return #marks() > 0 end, 25), 'code header did not render')
for _, name in ipairs { 'coffee-neutral', 'ayu-ink', 'ayu-neutral', 'void-neutral', 'void-ink', 'soviet-dark', 'dark-2026', 'tango',
  'coffee-steel-purple', 'coffee-steel', 'coffee-sky', 'coffee-slate' } do
  vim.cmd.colorscheme(name)
  require('render-markdown').enable()
  vim.cmd.redraw()
  local found_language, found_background = false, false
  for _, mark in ipairs(marks()) do
    local details = mark[4]
    found_background = found_background or (details.hl_group == 'RenderMarkdownCode' and details.hl_eol == true)
    for _, chunk in ipairs(details.virt_text or {}) do
      found_language = found_language or chunk[1]:find('bash', 1, true) ~= nil
      assert(not chunk[1]:find('█', 1, true), name .. ': header fills with foreground blocks that kitty brightens')
    end
  end
  assert(found_language, name .. ': language label was lost')
  assert(found_background, name .. ': header must paint the code background through end of line')
end
print 'PASS: rendered Markdown code headers retain labels without contrast-boosted blocks'

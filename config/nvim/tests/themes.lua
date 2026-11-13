-- Installed plugins only; no network, real app reloads or running editor changes.
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/config/nvim')
vim.cmd 'packadd codediff.nvim'
dofile 'config/nvim/lua/config/codediff.lua'

local function luminance(color)
  local sum = 0
  for i, weight in ipairs { 0.2126, 0.7152, 0.0722 } do
    local value = math.floor(color / 256 ^ (3 - i)) % 256 / 255
    sum = sum + weight * (value <= 0.04045 and value / 12.92 or ((value + 0.055) / 1.055) ^ 2.4)
  end
  return sum
end
local function contrast(a, b)
  local x, y = luminance(a), luminance(b)
  return (math.max(x, y) + 0.05) / (math.min(x, y) + 0.05)
end
local function hl(name) return vim.api.nvim_get_hl(0, { name = name, link = false }) end
for _, name in ipairs { 'coffee-neutral', 'ayu-ink', 'ayu-neutral', 'void-neutral', 'void-ink', 'soviet-dark' } do
  vim.cmd.colorscheme(name)
  assert(vim.g.colors_name == name, name .. ' did not load')
  assert(hl('DapViewNormal').dim, name .. ' lost panel dimming')
  assert(hl('DapViewNormal').bg, name .. ' lost panel background')
  for _, syntax in ipairs { 'String', 'Number', 'Boolean', 'Constant', 'Function', 'Keyword', 'Type',
    'Special', 'PreProc', 'Identifier', '@property', '@variable.parameter', '@variable.builtin',
    '@type.builtin', '@module', '@tag', '@tag.attribute', 'Normal' } do
    local fg = hl(syntax).fg
    if fg then
      for _, diff in ipairs { 'CodeDiffCharInsert', 'CodeDiffCharDelete' } do
        local ratio = contrast(fg, assert(hl(diff).bg))
        assert(ratio >= 4, name .. ': ' .. syntax .. ' on ' .. diff .. ' is ' .. ratio)
      end
    end
  end
end
print 'PASS: six frozen themes, panel dimming and readable CodeDiff character backgrounds'

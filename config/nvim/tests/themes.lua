-- Installed plugins only; no network, real app reloads or running editor changes.
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/config/nvim')

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
-- kitty leaves a cell alone when its two colours are this close; such groups are hidden on purpose.
local function same(a, b)
  local sum = 0
  for i = 1, 3 do
    local function linear(color)
      local value = math.floor(color / 256 ^ (3 - i)) % 256 / 255
      return value <= 0.04045 and value / 12.92 or ((value + 0.055) / 1.055) ^ 2.4
    end
    sum = sum + math.abs(linear(a) - linear(b))
  end
  return sum <= 0.001
end
local function read(path)
  local file = assert(io.open(path))
  local text = file:read 'a'
  file:close()
  return text
end
for _, name in ipairs { 'ayu-ink', 'ayu-neutral', 'void-neutral', 'void-ink', 'dark-2026', 'tango', 'coffee-sky', 'coffee-slate' } do
  vim.cmd.colorscheme(name)
  assert(vim.g.colors_name == name, name .. ' did not load')
  assert(hl('DapViewNormal').dim, name .. ' lost panel dimming')
  assert(hl('DapViewNormal').bg, name .. ' lost panel background')
  -- No theme sets kitty's contrast floor, so nothing may depend on the terminal lifting it to 3:1.
  local background = tonumber(read('config/themes/' .. name .. '/kitty.conf'):match '\nbackground%s+#(%x+)', 16)
  for group in read('config/nvim/colors/' .. name .. '.lua'):gmatch "\nh%(0, '([^']+)'" do
    local value = hl(group)
    local surface = value.bg or background
    if value.fg and not value.reverse and not same(value.fg, surface) then
      assert(contrast(value.fg, surface) >= 3, ('%s: %s is %.2f on its background'):format(name, group, contrast(value.fg, surface)))
    end
  end
  assert(contrast(tonumber(vim.g.terminal_color_8:sub(2), 16), background) >= 3, name .. ': terminal colour 8 is too dim')
  if name == 'dark-2026' or name == 'tango' then
    for _, syntax in ipairs { 'Normal', 'Comment', 'String', 'Number', 'Boolean', 'Constant',
      'Function', 'Keyword', 'Type', 'Special', 'Identifier', '@property', '@variable.parameter',
      '@variable.builtin', '@type.builtin', '@module', '@tag', '@tag.attribute' } do
      local fg = assert(hl(syntax).fg, name .. ': missing foreground for ' .. syntax)
      for _, surface in ipairs { 'Normal', 'NormalFloat', 'CursorLine', 'Visual' } do
        local bg = hl(surface).bg or hl('Normal').bg
        assert(contrast(fg, bg) >= 4.5, name .. ': ' .. syntax .. ' unreadable on ' .. surface)
      end
    end
    assert(hl('FloatBorder').fg == hl('TelescopeBorder').fg, name .. ': inconsistent popup borders')
    assert(not hl('Keyword').italic, name .. ': minimal syntax must not add keyword italics')
  end
end
print 'PASS: frozen themes, minimal-theme readability and panel dimming'

-- bat (and Yazi, which uses the same syntax.tmTheme) must colour a token in the same colour family
-- as Neovim's treesitter highlight does. Real bat and real parsers; no LSP, so no semantic tokens.
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. '/config/nvim')
if vim.fn.executable 'bat' == 0 then
  print 'SKIP: bat is not installed'
  return
end

local samples = {
  json = { text = '{ "alpha": "beta", "gamma": 42, "delta": true }\n', roles = { key = '"alpha', string = 'beta', number = '42', boolean = 'true' } },
  yaml = {
    text = '# note\nalpha: beta\ngamma: 42\ndelta: true\nepsilon: "zeta"\n',
    roles = { comment = 'note', key = 'alpha', string = 'zeta', number = '42', boolean = 'true' },
  },
  typescript = {
    text = '// note\ninterface Shape { size: number }\nfunction area(input: Shape): number {\n  const label = "text";\n  return input.size * 2;\n}\n',
    roles = {
      comment = 'note', declaration = 'function', keyword = 'return', ['function'] = 'area', type = 'Shape',
      property = 'size', variable = 'label', string = 'text', number = '2',
    },
  },
  python = {
    text = '# note\nclass Shape:\n    def area(self, scale):\n        label = "text"\n        return scale * 2\n',
    roles = { comment = 'note', declaration = 'def', keyword = 'return', ['function'] = 'area', type = 'Shape', string = 'text', number = '2' },
  },
}

-- Hue in degrees, or nil for a colour with too little chroma to have a family.
local function hue(color)
  local r, g, b = math.floor(color / 65536) / 255, math.floor(color / 256) % 256 / 255, color % 256 / 255
  local max, min = math.max(r, g, b), math.min(r, g, b)
  if max - min < 0.12 then return nil end
  local h = max == r and (g - b) / (max - min) % 6 or max == g and (b - r) / (max - min) + 2 or (r - g) / (max - min) + 4
  return h * 60
end
local function same_family(a, b)
  local x, y = hue(a), hue(b)
  if not x or not y then return x == y end
  local distance = math.abs(x - y) % 360
  return math.min(distance, 360 - distance) <= 40
end

local temp = vim.fn.tempname()
vim.fn.mkdir(temp .. '/themes', 'p')
local names = { 'ayu-ink', 'ayu-neutral', 'void-neutral', 'void-ink', 'dark-2026', 'tango', 'coffee-sky', 'coffee-slate', 'coffee-light' }
for _, name in ipairs(names) do
  assert(vim.uv.fs_copyfile('config/themes/' .. name .. '/syntax.tmTheme', temp .. '/themes/' .. name .. '.tmTheme'))
end
local env = { BAT_CONFIG_DIR = temp, BAT_CACHE_PATH = temp .. '/cache', COLORTERM = 'truecolor' }
local built = vim.system({ 'bat', 'cache', '--build' }, { env = env }):wait()
assert(built.code == 0, built.stderr)

-- The colour bat paints each byte of the sample in.
local function bat(name, language, text)
  local result = vim.system({ 'bat', '--color=always', '--paging=never', '--style=plain', '--theme', name, '--language', language },
    { env = env, stdin = text }):wait()
  assert(result.code == 0, result.stderr)
  local colors, fg, i, out = {}, nil, 1, result.stdout
  while i <= #out do
    local stop, params = out:match('^\27%[()([%d;]*)m', i)
    if stop then
      local r, g, b = params:match '38;2;(%d+);(%d+);(%d+)'
      if r then fg = r * 65536 + g * 256 + b elseif params == '0' or params == '' then fg = nil end
      i = i + #params + 3
    else
      colors[#colors + 1] = fg or false
      i = i + 1
    end
  end
  return colors
end

local function editor(buffer, row, column)
  local fg, best = vim.api.nvim_get_hl(0, { name = 'Normal', link = false }).fg, -1
  for _, capture in ipairs(vim.treesitter.get_captures_at_pos(buffer, row, column)) do
    local value = vim.api.nvim_get_hl(0, { name = '@' .. capture.capture .. '.' .. capture.lang, link = false })
    local priority = tonumber(capture.metadata.priority) or 100
    if value.fg and priority >= best then fg, best = value.fg, priority end
  end
  return fg
end

local failures = {}
for language, sample in pairs(samples) do
  local buffer = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buffer, 0, -1, false, vim.split(sample.text, '\n'))
  vim.treesitter.start(buffer, language)
  vim.treesitter.get_parser(buffer, language):parse(true)
  for _, name in ipairs(names) do
    vim.cmd.colorscheme(name)
    local painted = bat(name, language, sample.text)
    for role, word in pairs(sample.roles) do
      local offset = assert(sample.text:find(word, 1, true), word)
      local before = sample.text:sub(1, offset - 1)
      local row = select(2, before:gsub('\n', ''))
      local column = #before - #(before:match '.*\n' or '')
      local ours, theirs = editor(buffer, row, column), painted[offset] or vim.api.nvim_get_hl(0, { name = 'Normal', link = false }).fg
      if not same_family(ours, theirs) then
        failures[#failures + 1] = ('%s %s %s: nvim #%06x, bat #%06x'):format(name, language, role, ours, theirs)
      end
    end
  end
end
table.sort(failures)
assert(#failures == 0, '\n' .. table.concat(failures, '\n'))
print 'PASS: bat and Neovim colour JSON, YAML, TypeScript and Python tokens in the same families'

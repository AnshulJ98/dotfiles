-- Editor-state snapshot for verifying config refactors.
--
-- Loaded twice in one nvim by scripts/snapshot.sh: once with `--cmd`, before
-- init.lua, to record every `vim.pack.add` spec, plugin `setup`/`install`/
-- `load_extension` call and `vim.lsp.config`/`vim.lsp.enable` call in order;
-- once with `-c`, after init.lua and after the LSP and gitsigns have attached
-- to the opened file, to write that record plus the resulting keymaps,
-- autocmds, options, highlights, signs, DAP and LSP state to $NVIM_SNAPSHOT.
-- Functions are printed as `<function>`, so moving code between files leaves
-- the snapshot unchanged while any behavioural drift shows up in a diff.

if not _G.__snapshot then
  local record = { packs = {}, setups = {}, lsp_configs = {}, lsp_enables = {} }
  _G.__snapshot = record

  -- Only calls made from the config itself are recorded; plugins call their
  -- own sub-module `setup`s in `pairs` order, which differs between runs.
  local config_dirs = { vim.fn.stdpath 'config', vim.uv.fs_realpath(vim.fn.stdpath 'config') }
  local function called_from_config()
    local source = debug.getinfo(3, 'S').source:sub(2)
    for _, dir in ipairs(config_dirs) do
      if vim.startswith(source, dir) then return true end
    end
    return false
  end

  local wrapped = setmetatable({}, { __mode = 'k' })
  local raw_require = require
  _G.require = function(name)
    local mod = raw_require(name)
    if type(mod) == 'table' and not wrapped[mod] then
      wrapped[mod] = true
      for _, method in ipairs { 'setup', 'install', 'load_extension' } do
        local original = rawget(mod, method)
        if type(original) == 'function' then
          mod[method] = function(...)
            if called_from_config() then record.setups[#record.setups + 1] = { name .. '.' .. method, vim.deepcopy { ... } } end
            return original(...)
          end
        end
      end
    end
    return mod
  end

  local pack_add = vim.pack.add
  vim.pack.add = function(specs, opts)
    record.packs[#record.packs + 1] = vim.deepcopy(specs)
    return pack_add(specs, opts)
  end

  local config_mt = getmetatable(vim.lsp.config)
  local config_call = config_mt.__call
  config_mt.__call = function(self, name, cfg)
    record.lsp_configs[#record.lsp_configs + 1] = { name, vim.deepcopy(cfg) }
    return config_call(self, name, cfg)
  end
  local lsp_enable = vim.lsp.enable
  vim.lsp.enable = function(name, enable)
    record.lsp_enables[#record.lsp_enables + 1] = { name, enable }
    return lsp_enable(name, enable)
  end
  return
end

local record = _G.__snapshot
local out = {}

local function strip(item, path)
  if path[#path] == vim.inspect.METATABLE then return nil end
  local kind = type(item)
  if kind == 'function' or kind == 'userdata' or kind == 'thread' then return '<' .. kind .. '>' end
  return item
end

local function dump(label, value)
  out[#out + 1] = '### ' .. label
  out[#out + 1] = vim.inspect(value, { process = strip, newline = '\n', indent = '  ' })
  out[#out + 1] = ''
end

local function sorted_lines(label, lines)
  table.sort(lines)
  out[#out + 1] = '### ' .. label
  vim.list_extend(out, lines)
  out[#out + 1] = ''
end

local function keymap_lines(get)
  local lines = {}
  for _, mode in ipairs { 'n', 'i', 'v', 'x', 's', 'o', 't', 'c' } do
    for _, map in ipairs(get(mode)) do
      local flags = {}
      for _, flag in ipairs { 'noremap', 'expr', 'silent', 'nowait' } do
        if map[flag] == 1 then flags[#flags + 1] = flag end
      end
      lines[#lines + 1] = ('%s %s => %s [%s]'):format(mode, map.lhs, map.desc or map.rhs or '<callback>', table.concat(flags, ','))
    end
  end
  return lines
end

-- The config derives its server list from a `pairs` walk, so the order of
-- these calls and of `ensure_installed` is hash order, not config order.
local function by_name(a, b) return a[1] < b[1] end
table.sort(record.lsp_configs, by_name)
table.sort(record.lsp_enables, by_name)
for _, call in ipairs(record.setups) do
  local opts = call[2][1]
  if type(opts) == 'table' and vim.islist(opts.ensure_installed) then table.sort(opts.ensure_installed) end
end

dump('vim.pack.add calls', record.packs)
dump('setup calls', record.setups)
dump('vim.lsp.config calls', record.lsp_configs)
dump('vim.lsp.enable calls', record.lsp_enables)

local packs = {}
for _, plugin in ipairs(vim.pack.get()) do
  packs[#packs + 1] = ('%s active=%s version=%s'):format(plugin.spec.name, tostring(plugin.active), tostring(plugin.spec.version))
end
sorted_lines('vim.pack.get', packs)

sorted_lines('global keymaps', keymap_lines(vim.api.nvim_get_keymap))
sorted_lines('buffer keymaps', keymap_lines(function(mode) return vim.api.nvim_buf_get_keymap(0, mode) end))

local autocmds = {}
for _, au in ipairs(vim.api.nvim_get_autocmds {}) do
  local target = au.buffer and ('buffer ' .. au.buffer) or (au.pattern or '')
  autocmds[#autocmds + 1] = ('%s | %s | %s | %s'):format(au.event, au.group_name or '-', target, au.desc or au.command or '<callback>')
end
sorted_lines('autocmds', autocmds)

local options = {}
for _, name in ipairs {
  'number',
  'relativenumber',
  'mouse',
  'showmode',
  'clipboard',
  'breakindent',
  'undofile',
  'ignorecase',
  'smartcase',
  'signcolumn',
  'updatetime',
  'timeoutlen',
  'splitright',
  'splitbelow',
  'list',
  'listchars',
  'fillchars',
  'foldtext',
  'showbreak',
  'laststatus',
  'splitkeep',
  'title',
  'titlestring',
  'inccommand',
  'cursorline',
  'winborder',
  'pumborder',
  'scrolloff',
  'foldlevel',
  'confirm',
} do
  options[name] = vim.o[name]
end
dump('options', options)
dump('globals', {
  mapleader = vim.g.mapleader,
  maplocalleader = vim.g.maplocalleader,
  loaded_node_provider = vim.g.loaded_node_provider,
  loaded_perl_provider = vim.g.loaded_perl_provider,
  loaded_python3_provider = vim.g.loaded_python3_provider,
  loaded_ruby_provider = vim.g.loaded_ruby_provider,
})
dump('diagnostic config', vim.diagnostic.config())
dump('colorscheme', vim.g.colors_name)
dump('highlights', vim.api.nvim_get_hl(0, {}))

local signs = vim.fn.sign_getdefined()
table.sort(signs, function(a, b) return a.name < b.name end)
dump('signs', signs)

local dap = package.loaded.dap
if dap then
  dump('dap.adapters', dap.adapters)
  dump('dap.configurations', dap.configurations)
  dump('dap.defaults', dap.defaults)
  local listeners = {}
  for _, phase in ipairs { 'before', 'after' } do
    for event, handlers in pairs(dap.listeners[phase]) do
      local keys = vim.tbl_keys(handlers)
      table.sort(keys)
      listeners[phase .. '.' .. event] = keys
    end
  end
  dump('dap.listeners', listeners)
end

local lsp = {}
for _, name in ipairs { 'vtsls', 'pyright', 'eslint', 'markdown_oxide', 'jsonls', 'yamlls', 'bashls', 'lua_ls' } do
  lsp[name] = { enabled = vim.lsp.is_enabled(name), config = vim.lsp.config[name] }
end
dump('lsp resolved configs', lsp)

local clients = {}
for _, client in ipairs(vim.lsp.get_clients { bufnr = 0 }) do
  clients[#clients + 1] = client.name
end
sorted_lines('lsp clients on buffer', clients)

local lint = package.loaded.lint
if lint then dump('lint', { linters_by_ft = lint.linters_by_ft, markdownlint_args = lint.linters.markdownlint.args }) end

local statusline = package.loaded['mini.statusline']
if statusline then
  dump('statusline sections', {
    location = statusline.section_location {},
    filename = statusline.section_filename {},
    lsp = statusline.section_lsp {},
  })
end

local ok_ts, treesitter = pcall(require, 'nvim-treesitter')
if ok_ts then
  local parsers = treesitter.get_installed 'parsers'
  table.sort(parsers)
  sorted_lines('treesitter parsers', parsers)
end

local ok_mason, registry = pcall(require, 'mason-registry')
if ok_mason then
  local packages = registry.get_installed_package_names()
  table.sort(packages)
  sorted_lines('mason packages', packages)
end

local rtp = {}
for _, path in ipairs(vim.opt.rtp:get()) do
  if path:find('kitty', 1, true) then rtp[#rtp + 1] = path end
end
sorted_lines('kitty-scrollback rtp entries', rtp)

dump('messages', vim.fn.execute 'messages')

local lines = vim.split(table.concat(out, '\n'), '\n', { plain = true })
vim.fn.writefile(lines, (assert(vim.env.NVIM_SNAPSHOT, 'NVIM_SNAPSHOT is not set')))

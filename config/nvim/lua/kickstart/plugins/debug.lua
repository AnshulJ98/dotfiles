-- debug.lua
--
-- DAP (Debug Adapter Protocol) for Go and Node.js/TypeScript.

vim.pack.add {
  'https://github.com/mfussenegger/nvim-dap',
  'https://github.com/rcarriga/nvim-dap-ui',
  'https://github.com/nvim-neotest/nvim-nio',
  'https://github.com/mason-org/mason.nvim',
  'https://github.com/jay-babu/mason-nvim-dap.nvim',
  'https://github.com/leoluz/nvim-dap-go',
  'https://github.com/theHamsta/nvim-dap-virtual-text',
  'https://github.com/igorlfs/nvim-dap-view',
}

-- Values are capped so large payloads do not wrap the code line; inline
-- virtual text spanning many screen rows stalls redraw on cursor movement.
-- Full values remain reachable via hover (<leader>dh) and the scopes pane.
require('nvim-dap-virtual-text').setup {
  display_callback = function(variable, _, _, _, options)
    local value = variable.value:gsub('%s+', ' ')
    if #value > 50 then value = value:sub(1, 50) .. '…' end
    if options.virt_text_pos == 'inline' then return ' = ' .. value end
    return variable.name .. ' = ' .. value
  end,
}
vim.api.nvim_set_hl(0, 'NvimDapVirtualText', { link = 'DiagnosticVirtualTextInfo' })

-- nvim-dap-virtual-text refreshes on every `variables` response, and three
-- consumers (nvim-dap, dap-view scopes, dap-ui's scopes element even while
-- closed) each request variables per scope per stop. Each refresh clears all
-- extmarks and re-runs the treesitter locals query over the whole buffer.
-- Coalescing the burst into one refresh 20 ms after the last response cut the
-- per-step main-loop stall from 19 ms to 8 ms on a 1100-line file (3 scopes)
-- and from 37 ms to 17 ms on a 3300-line file, with no visible delay. The slot
-- is assigned once in setup; DapVirtualTextToggle does not reassign it.
do
  local variables = require('dap').listeners.after.variables
  local refresh = variables['nvim-dap-virtual-text']
  local pending
  variables['nvim-dap-virtual-text'] = function(session)
    if pending then
      pending:stop()
      pending:close()
    end
    pending = vim.defer_fn(function()
      pending = nil
      refresh(session)
    end, 20)
  end
end
require('dap-view').setup {
  windows = {
    position = 'right',
    size = 60,
    -- nvim-dap owns the pwa-node terminal (see terminal_win_cmd below).
    terminal = { hide = { 'pwa-node' } },
  },
  switchbuf = function(bufnr)
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
      if vim.api.nvim_win_get_buf(win) == bufnr then return win end
    end
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
      if not vim.wo[win].winfixbuf and vim.bo[vim.api.nvim_win_get_buf(win)].buftype == '' then return win end
    end
  end,
  auto_toggle = true,
  winbar = {
    -- The winbar has 60 columns: five labels take 44, and each button costs
    -- three. Hints, exceptions, and the step_back/run_last/disconnect buttons
    -- would clip the leftmost section to `<S]`; hints stay in the help popup,
    -- and js-debug cannot step back anyway.
    show_keymap_hints = false,
    -- dap-view opens on watches and only re-renders scopes on stop when
    -- scopes is already showing, so a first stop would land on an empty pane.
    default_section = 'scopes',
    sections = { 'scopes', 'watches', 'breakpoints', 'threads', 'repl' },
    base_sections = {
      repl = { label = 'REPL', keymap = 'P' },
    },
    controls = {
      enabled = true,
      buttons = { 'play', 'step_into', 'step_over', 'step_out', 'terminate' },
    },
  },
}

local function toggle_dap_terminal()
  local session = require('dap').session()
  local buf = session and session.term_buf
  if not (buf and vim.api.nvim_buf_is_valid(buf)) then
    vim.notify('No active DAP terminal', vim.log.levels.WARN)
    return
  end

  for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    if vim.api.nvim_win_get_buf(win) == buf then
      vim.api.nvim_win_hide(win)
      return
    end
  end

  local target = vim.api.nvim_get_current_win()
  if vim.bo[vim.api.nvim_win_get_buf(target)].buftype ~= '' then
    target = nil
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
      if vim.bo[vim.api.nvim_win_get_buf(win)].buftype == '' then
        target = win
        break
      end
    end
  end
  if not target then
    vim.notify('No code window is available for the DAP terminal', vim.log.levels.WARN)
    return
  end

  local win = vim.api.nvim_open_win(buf, true, { split = 'below', win = target, height = 15 })
  local wo = vim.wo[win][0]
  wo.number = false
  wo.relativenumber = false
  wo.signcolumn = 'no'
  vim.cmd.startinsert()
end

vim.keymap.set('n', '<F5>', function() require('dap').continue() end, { desc = 'Debug: Start/Continue' })
vim.keymap.set('n', '<F1>', function() require('dap').step_into() end, { desc = 'Debug: Step Into' })
vim.keymap.set('n', '<F2>', function() require('dap').step_over() end, { desc = 'Debug: Step Over' })
vim.keymap.set('n', '<F3>', function() require('dap').step_out() end, { desc = 'Debug: Step Out' })
vim.keymap.set('n', '<leader>dt', function() require('dap').terminate() end, { desc = 'Debug: [T]erminate' })
vim.keymap.set('n', '<leader>dT', toggle_dap_terminal, { desc = 'Debug: Toggle integrated [T]erminal' })
vim.keymap.set('n', '<leader>dr', function() require('dap').restart() end, { desc = 'Debug: [R]estart' })
vim.keymap.set('n', '<leader>dc', function() require('dap').run_to_cursor() end, { desc = 'Debug: Run to [C]ursor' })
vim.keymap.set('n', '<leader>dl', function() require('dap').run_last() end, { desc = 'Debug: Run [L]ast' })
vim.keymap.set('n', '<leader>dp', function() require('dap').pause() end, { desc = 'Debug: [P]ause' })
vim.keymap.set('n', '<leader>d[', function() require('dap').up() end, { desc = 'Debug: Frame up (caller)' })
vim.keymap.set('n', '<leader>d]', function() require('dap').down() end, { desc = 'Debug: Frame down (callee)' })
vim.keymap.set('n', '<leader>b', function() require('dap').toggle_breakpoint() end, { desc = 'Debug: Toggle Breakpoint' })
vim.keymap.set('n', '<leader>B', function() require('dap').set_breakpoint(vim.fn.input 'Breakpoint condition: ') end, { desc = 'Debug: Set Breakpoint' })
vim.keymap.set('n', '<F7>', function() require('dapui').toggle() end, { desc = 'Debug: Toggle DAP UI (splits)' })
vim.keymap.set('n', '<F8>', '<cmd>DapViewToggle<CR>', { desc = 'Debug: Toggle DAP View (single window)' })
vim.keymap.set('n', '<leader>dv', '<cmd>DapVirtualTextToggle<CR>', { desc = 'Debug: Toggle [V]irtual text' })
vim.keymap.set({ 'n', 'v' }, '<leader>de', function() require('dapui').eval() end, { desc = 'Debug: [E]val expression' })
vim.keymap.set('n', '<leader>df', function() require('dapui').float_element('scopes', { enter = true }) end, { desc = 'Debug: [F]loat scopes' })
vim.keymap.set('n', '<leader>dk', function() require('dapui').float_element('stacks', { enter = true }) end, { desc = 'Debug: stac[K]s float' })
vim.keymap.set('n', '<leader>dw', function() require('dapui').float_element('watches', { enter = true }) end, { desc = 'Debug: [W]atches float' })
-- dap-view hover: word under cursor, or the visual selection. <CR> expands, [[ parent, s set value, q closes.
vim.keymap.set({ 'n', 'v' }, '<leader>dh', function() require('dap-view').hover(nil, true) end, { desc = 'Debug: [H]over variable' })

-- dap-view re-applies its configured size on every WinClosed/WinNew (its issue
-- #190), undoing manual resizes. WinClosed fires before the layout changes, so
-- snapshotting the current size into its baseline makes the restore a no-op.
vim.api.nvim_create_autocmd({ 'WinClosed', 'WinNew' }, {
  group = vim.api.nvim_create_augroup('dap_view_keep_size', { clear = true }),
  callback = function()
    local state = require 'dap-view.state'
    if state.winnr and vim.api.nvim_win_is_valid(state.winnr) then
      state.og_width = vim.api.nvim_win_get_width(state.winnr)
      state.og_height = vim.api.nvim_win_get_height(state.winnr)
    end
  end,
})

-- dap-view window options. Long values wrap instead of running off screen;
-- the tree indents with literal tabs, so `list` would draw a » per level;
-- the panel takes DapViewNormal so it reads as chrome rather than code. Its
-- values are JavaScript expressions from js-debug, so the parser colours
-- object summaries without replacing dap-view's higher-priority highlights.
-- dap-view opens the panel without entering it and forces cursorline just
-- before setting the filetype, so the focused-window rule from init.lua is
-- restated here; inside FileType the buffer's own window is current, so the
-- filetype stands in for focus (the hover float is entered, the panel is
-- not). bufwinid so the options land on the panel even when FileType fires
-- with another window current. The `[0]` form is `:setlocal`: `vim.wo[win].x`
-- acts as `:set` when win is current (the hover float is entered before its
-- filetype is set), which would hand these values to every window split from
-- it.
vim.api.nvim_create_autocmd('FileType', {
  group = vim.api.nvim_create_augroup('dap_view_window', { clear = true }),
  pattern = { 'dap-view', 'dap-view-hover' },
  callback = function(args)
    local win = vim.fn.bufwinid(args.buf)
    if win == -1 then return end
    local wo = vim.wo[win][0]
    wo.wrap = true
    wo.linebreak = true
    wo.breakindent = true
    wo.list = false
    wo.signcolumn = 'no'
    wo.winhighlight = 'Normal:DapViewNormal,NormalNC:DapViewNormal'
    wo.cursorline = args.match == 'dap-view-hover'
    vim.bo[args.buf].tabstop = 2
    pcall(vim.treesitter.start, args.buf, 'javascript')
  end,
})

-- The REPL is a prompt buffer, which blink.cmp refuses by design, so
-- completion comes from nvim-dap's own omnifunc, triggered on the adapter's
-- trigger characters (`.` `[` `"` `'` for js-debug). Native popup keys apply.
vim.api.nvim_create_autocmd('FileType', {
  group = vim.api.nvim_create_augroup('dap_repl_completion', { clear = true }),
  pattern = 'dap-repl',
  callback = function(args) require('dap.ext.autocompl').attach(args.buf) end,
})

local function dap_expr_under_cursor()
  local node = vim.treesitter.get_node()
  if not node then return vim.fn.expand '<cexpr>' end
  while node:parent() and vim.tbl_contains({ 'member_expression', 'subscript_expression' }, node:parent():type()) do
    node = node:parent()
  end
  return vim.treesitter.get_node_text(node, 0)
end

vim.keymap.set('n', '<leader>dy', function()
  local session = require('dap').session()
  if not session then return end
  local expr = dap_expr_under_cursor()
  session:request('evaluate', {
    expression = 'JSON.stringify(' .. expr .. ', null, 2)',
    context = 'repl',
    frameId = (session.current_frame or {}).id,
  }, function(err, resp)
    if err then
      vim.notify(tostring(err), vim.log.levels.ERROR)
      return
    end
    vim.fn.setreg('+', resp.result)
    vim.notify('Yanked ' .. expr .. ' to clipboard', vim.log.levels.INFO)
  end)
end, { desc = 'Debug: [Y]ank variable as JSON' })

local dap = require 'dap'
local dapui = require 'dapui'

require('mason-nvim-dap').setup {
  automatic_installation = true,
  handlers = {},
  ensure_installed = {
    'delve',
    'js-debug-adapter',
  },
}

---@diagnostic disable-next-line: missing-fields
dapui.setup {
  icons = { expanded = '▾', collapsed = '▸', current_frame = '▶' },
  floating = { border = 'rounded' },
  -- Types (`Object`, `number`, `string`) on every row are noise; VS Code and
  -- the dap-view panel both omit them.
  render = { max_type_length = 0 },
  layouts = {
    {
      elements = {
        { id = 'scopes', size = 0.6 },
        { id = 'watches', size = 0.4 },
      },
      position = 'left',
      size = 35,
    },
    {
      elements = { { id = 'repl', size = 1.0 } },
      position = 'bottom',
      size = 8,
    },
  },
  ---@diagnostic disable-next-line: missing-fields
  controls = {
    icons = {
      pause = '⏸',
      play = '▶',
      step_into = '⏎',
      step_over = '⏭',
      step_out = '⏮',
      step_back = '↩',
      run_last = '↻',
      terminate = '⏹',
      disconnect = '⏏',
    },
  },
}

-- The integrated terminal is a split under the code, owned by nvim-dap.
-- dapui.setup claims terminal_win_cmd for a console element no layout uses,
-- and dap-view would otherwise carve the terminal out of its own panel
-- (panel 30 wide, terminal 102 on the first stop) and hide it when the
-- child session exits, although the debug shell inside is still running.
-- focus_terminal puts the cursor in that shell at launch. The split is
-- relative to the current window; botright would span the panel too and
-- cost the scopes pane fifteen rows.
dap.defaults.fallback.terminal_win_cmd = 'belowright 15new'
dap.defaults['pwa-node'].focus_terminal = true

-- focus_terminal lands in terminal-normal mode, one `i` short of typing.
-- It moves the cursor after TermOpen, so the check is deferred one tick.
vim.api.nvim_create_autocmd('TermOpen', {
  group = vim.api.nvim_create_augroup('dap_terminal_insert', { clear = true }),
  callback = function(args)
    if not vim.b[args.buf]['dap-type'] then return end
    vim.schedule(function()
      if vim.api.nvim_get_current_buf() == args.buf then vim.cmd.startinsert() end
    end)
  end,
})

-- dap-ui writes each value as one DapUIValue extmark (priority 4096), so the
-- string is a single colour. Attaching the javascript parser colours strings
-- and numbers inside `{id: 11, name: 'Maria'}`; names and types stay covered
-- by dap-ui's own extmarks. DapUIValue must be attribute-free for the parser
-- colours to show, and dap-ui relinks it to Normal on every ColorScheme, so
-- it is cleared here, on each open, rather than once at startup.
vim.api.nvim_create_autocmd('FileType', {
  group = vim.api.nvim_create_augroup('dapui_value_syntax', { clear = true }),
  pattern = { 'dapui_scopes', 'dapui_watches', 'dapui_hover' },
  callback = function(args)
    vim.api.nvim_set_hl(0, 'DapUIValue', {})
    vim.treesitter.start(args.buf, 'javascript')
  end,
})

vim.fn.sign_define('DapBreakpoint', { text = '●', texthl = 'DiagnosticError', numhl = 'DiagnosticError' })
vim.fn.sign_define('DapBreakpointCondition', { text = '◆', texthl = 'DiagnosticWarn', numhl = 'DiagnosticWarn' })
vim.fn.sign_define('DapLogPoint', { text = '◉', texthl = 'DiagnosticInfo', numhl = 'DiagnosticInfo' })
vim.fn.sign_define('DapStopped', { text = '▶', texthl = 'DiagnosticOk', linehl = 'DapStoppedLine', numhl = 'DiagnosticOk' })
vim.fn.sign_define('DapBreakpointRejected', { text = '✖', texthl = 'DiagnosticError', numhl = 'DiagnosticError' })

-- dap-view handles auto-toggle via auto_toggle = true.
-- To use dap-ui instead, uncomment these and set auto_toggle = false above.
-- dap.listeners.after.event_initialized['dapui_config'] = dapui.open
-- dap.listeners.before.event_terminated['dapui_config'] = dapui.close
-- dap.listeners.before.event_exited['dapui_config'] = dapui.close

-- Go
require('dap-go').setup {
  delve = {
    detached = vim.fn.has 'win32' == 0,
  },
}

-- Node.js / TypeScript via js-debug-adapter (vscode-js-debug)
local js_debug_path = require('mason-registry').get_package('js-debug-adapter'):get_install_path()

dap.adapters['pwa-node'] = {
  type = 'server',
  host = 'localhost',
  port = '${port}',
  executable = {
    command = 'node',
    args = { js_debug_path .. '/js-debug/src/dapDebugServer.js', '${port}' },
  },
}

-- js-debug answers setBreakpoints with provisional entries that omit `line`.
-- nvim-dap then keys sign state on a nil line, every breakpoint shares one
-- state table, and the Rejected sign never clears on the later ones
-- (nvim-dap #1501). DAP guarantees response order matches the request, so
-- the line is recoverable by index. Must run before nvim-dap's own handler.
dap.listeners.before.setBreakpoints['js-debug-line'] = function(_, err, response, request)
  if err or not response or not request then return end
  for i, bp in ipairs(response.breakpoints or {}) do
    bp.line = bp.line or (request.breakpoints[i] or {}).line
  end
end

-- Debug shell: js-debug injects its bootloader into the shell via NODE_OPTIONS,
-- so any node / npm / npx / ts-node run inside auto-attaches as a child session
-- with breakpoints already set. The root session outlives every child.
local debug_shell = {
  type = 'pwa-node',
  request = 'launch',
  name = 'Debug shell (auto-attach)',
  runtimeExecutable = vim.o.shell,
  cwd = '${workspaceFolder}',
  console = 'integratedTerminal',
  autoAttachChildProcesses = true,
  sourceMaps = true,
  -- Dependency source maps that point at unshipped .ts sources produce
  -- sourceReference-only frames; excluding them reports the shipped .js instead.
  resolveSourceMapLocations = { '${workspaceFolder}/**', '!**/node_modules/**' },
  skipFiles = { '<node_internals>/**', '**/node_modules/**' },
}

-- Same shell in a new kitty OS window. js-debug polls the processId returned
-- by runInTerminal and terminates the session when it exits, so the launcher
-- must outlive the window; `kitten @ launch` returns at once and fails.
-- --single-instance with --wait-for-single-instance-window-close blocks until
-- the window closes and carries env and cwd across the handoff.
local debug_shell_kitty = vim.tbl_extend('force', debug_shell, { name = 'Debug shell (kitty window)', console = 'externalTerminal' })
dap.defaults['pwa-node'].external_terminal = {
  command = 'kitty',
  args = { '--single-instance', '--wait-for-single-instance-window-close' },
}

vim.keymap.set('n', '<leader>ds', function() dap.run(debug_shell) end, { desc = 'Debug: debug [S]hell (split)' })
vim.keymap.set('n', '<leader>dS', function() dap.run(debug_shell_kitty) end, { desc = 'Debug: debug [S]hell (kitty window)' })

for _, lang in ipairs { 'typescript', 'javascript', 'typescriptreact', 'javascriptreact' } do
  dap.configurations[lang] = {
    debug_shell,
    debug_shell_kitty,
    {
      type = 'pwa-node',
      request = 'launch',
      name = 'Launch (node --enable-source-maps ./dist/index.js)',
      program = '${workspaceFolder}/dist/index.js',
      cwd = '${workspaceFolder}',
      runtimeArgs = { '--enable-source-maps' },
      sourceMaps = true,
      resolveSourceMapLocations = { '${workspaceFolder}/**', '!**/node_modules/**' },
      skipFiles = { '<node_internals>/**', '**/node_modules/**' },
    },
    {
      type = 'pwa-node',
      request = 'launch',
      name = 'Launch current file',
      program = '${file}',
      cwd = '${workspaceFolder}',
      runtimeArgs = { '--enable-source-maps' },
      sourceMaps = true,
      skipFiles = { '<node_internals>/**', '**/node_modules/**' },
    },
    {
      type = 'pwa-node',
      request = 'launch',
      name = 'NestJS (nest start --debug)',
      runtimeExecutable = 'npx',
      runtimeArgs = { 'nest', 'start', '--debug' },
      cwd = '${workspaceFolder}',
      sourceMaps = true,
      resolveSourceMapLocations = { '${workspaceFolder}/**', '!**/node_modules/**' },
      skipFiles = { '<node_internals>/**', '**/node_modules/**' },
      console = 'integratedTerminal',
    },
    {
      type = 'pwa-node',
      request = 'attach',
      name = 'Attach (port 9229)',
      port = 9229,
      cwd = '${workspaceFolder}',
      sourceMaps = true,
      skipFiles = { '<node_internals>/**', '**/node_modules/**' },
      restart = true,
    },
  }
end

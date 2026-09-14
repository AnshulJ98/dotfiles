-- debug.lua
--
-- DAP (Debug Adapter Protocol) for Go and Node.js/TypeScript.

-- mason.nvim is added in init.lua SECTION 6, which runs before this module.
vim.pack.add {
  'https://github.com/mfussenegger/nvim-dap',
  'https://github.com/jay-babu/mason-nvim-dap.nvim',
  'https://github.com/leoluz/nvim-dap-go',
  'https://github.com/theHamsta/nvim-dap-virtual-text',
  'https://github.com/igorlfs/nvim-dap-view',
}

-- Values are capped so large payloads do not wrap the code line; inline
-- virtual text spanning many screen rows stalls redraw on cursor movement.
-- Full values remain reachable via hover (<leader>dh) and the scopes pane.
require('nvim-dap-virtual-text').setup {
  enabled = false,
  display_callback = function(variable, _, _, _, options)
    local value = variable.value:gsub('%s+', ' ')
    -- strcharpart, not sub: js-debug's summaries are full of multibyte glyphs
    -- (…, ƒ) and a byte slice through one renders as <e2>.
    if vim.fn.strchars(value) > 50 then value = vim.fn.strcharpart(value, 0, 50) .. '…' end
    if options.virt_text_pos == 'inline' then return ' = ' .. value end
    return variable.name .. ' = ' .. value
  end,
}

-- nvim-dap-virtual-text refreshes on every `variables` response, and both
-- consumers (nvim-dap, dap-view scopes) request variables per scope per stop.
-- Each refresh clears all extmarks and re-runs the treesitter locals query
-- over the whole buffer. Coalescing the burst into one refresh 20 ms after the
-- last response cut the per-step main-loop stall from 19 ms to 8 ms on a
-- 1100-line file (3 scopes) and from 37 ms to 17 ms on a 3300-line file, with
-- no visible delay (measured while nvim-dap-ui was still a third consumer).
-- The slot is assigned once in setup; DapVirtualTextToggle does not reassign
-- it.
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
  -- The panel opens with the session and closes with it.
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

local terminal = require 'kickstart.terminal'
local dap = require 'dap'
local widgets = require 'dap.ui.widgets'

-- A step or a continue that never stops again leaves nvim-dap's session with
-- `stopped_thread_id` nil but `current_frame` still set (dap/session.lua,
-- clear_running); only an adapter-sent `continued` event clears the frame,
-- and js-debug sends none for a step. dap-view decides between "Session not
-- stopped" and a variables render on `current_frame`, so the panel kept the
-- returned frame on screen and re-rendered it from dead `variablesReference`
-- handles: correct on the stop, then stale values or "No variables returned
-- from adapter" once the frame had returned. Clearing the frame in the same
-- direction nvim-dap already cleared the thread makes the panel say what is
-- true. The refresh is dap-view's own, and on a resumed session it only
-- writes that one line: no request, no render coroutine.
for _, event in ipairs { 'continue', 'event_continued' } do
  dap.listeners.after[event]['dap-view-clear-stale-frame'] = function(session)
    if session.stopped_thread_id ~= nil then return end
    session.current_frame = nil
    require('dap-view.refresher').refresh_session_based_views()
  end
end

-- js-debug nests the real program under wrapper sessions (`nest start`
-- spawns `node dist/main`), and a stop focuses the innermost one.
-- dap.terminate() and dap.restart() act on the focused session only, which
-- leaves the wrapper alive holding the HTTP port; the next launch then
-- fails with EADDRINUSE. Terminate the whole hierarchy from the root, and
-- restart from the root's configuration once every session is gone.
local function root_session()
  local session = dap.session()
  if not session then return end
  while session.parent do
    session = session.parent
  end
  return session
end
local function terminate_debuggee()
  local root = root_session()
  if not root then return dap.terminate() end
  dap.set_session(root)
  dap.terminate { hierarchy = true }
end
local function restart_debuggee()
  local root = root_session()
  if not root then return end
  local config = root.config
  dap.set_session(root)
  local fired = false
  dap.terminate {
    hierarchy = true,
    on_done = vim.schedule_wrap(function()
      if fired then return end -- on_done fires once per session in the hierarchy
      fired = true
      vim.wait(5000, function() return vim.tbl_count(dap.sessions()) == 0 end, 100)
      dap.run(config)
    end),
  }
end

-- Sessions are closed only by terminate/disconnect; quitting with one active
-- orphans the detached adapter process. The terminal job (the debuggee) is
-- reaped by nvim's own exit.
vim.api.nvim_create_autocmd('VimLeavePre', {
  group = vim.api.nvim_create_augroup('dap_cleanup', { clear = true }),
  callback = function()
    for _, session in pairs(dap.sessions()) do
      pcall(function() session:close() end)
    end
  end,
})

-- Every launch focuses the integrated terminal in terminal mode
-- (focus_terminal below), so the session keys must work from there too; an
-- unmapped F-key in terminal mode is typed into the process as `^[OP`.
-- <leader> keys stay out of terminal mode so space remains typeable, and F9
-- stays normal-mode only because a breakpoint needs the cursor on a source
-- line. Shift-F5 and Ctrl-Shift-F5 are VS Code's stop and restart.
local session_modes = { 'n', 't' }
vim.keymap.set(session_modes, '<F5>', function() dap.continue() end, { desc = 'Debug: Start/Continue' })
vim.keymap.set(session_modes, '<F1>', function() dap.step_into() end, { desc = 'Debug: Step Into' })
vim.keymap.set(session_modes, '<F2>', function() dap.step_over() end, { desc = 'Debug: Step Over' })
vim.keymap.set(session_modes, '<F3>', function() dap.step_out() end, { desc = 'Debug: Step Out' })
vim.keymap.set(session_modes, '<S-F5>', terminate_debuggee, { desc = 'Debug: Terminate' })
vim.keymap.set(session_modes, '<C-S-F5>', restart_debuggee, { desc = 'Debug: Restart' })
vim.keymap.set(session_modes, '<F8>', '<cmd>DapViewToggle<CR>', { desc = 'Debug: Toggle DAP View' })
vim.keymap.set('n', '<leader>dt', terminate_debuggee, { desc = 'Debug: [T]erminate' })
vim.keymap.set('n', '<leader>dT', terminal.toggle_debug, { desc = 'Debug: Toggle integrated [T]erminal' })
vim.keymap.set('n', '<leader>dr', restart_debuggee, { desc = 'Debug: [R]estart' })
vim.keymap.set('n', '<leader>dc', function() dap.run_to_cursor() end, { desc = 'Debug: Run to [C]ursor' })
vim.keymap.set('n', '<leader>dl', function() dap.run_last() end, { desc = 'Debug: Run [L]ast' })
vim.keymap.set('n', '<leader>dp', function() dap.pause() end, { desc = 'Debug: [P]ause' })
vim.keymap.set('n', '<leader>d[', function() dap.up() end, { desc = 'Debug: Frame up (caller)' })
vim.keymap.set('n', '<leader>d]', function() dap.down() end, { desc = 'Debug: Frame down (callee)' })
vim.keymap.set('n', '<leader>b', function() dap.toggle_breakpoint() end, { desc = 'Debug: Toggle Breakpoint' })
-- F9 is VS Code's breakpoint key; the editor uses no function keys of its own.
vim.keymap.set('n', '<F9>', function() dap.toggle_breakpoint() end, { desc = 'Debug: Toggle Breakpoint' })
vim.keymap.set('n', '<leader>B', function() dap.set_breakpoint(vim.fn.input 'Breakpoint condition: ') end, { desc = 'Debug: Set Breakpoint' })
-- A logpoint prints its message (with {expr} interpolation) instead of stopping.
vim.keymap.set('n', '<leader>dL', function() dap.set_breakpoint(nil, nil, vim.fn.input 'Log message: ') end, { desc = 'Debug: Set [L]ogpoint' })
vim.keymap.set('n', '<leader>dv', '<cmd>DapVirtualTextToggle<CR>', { desc = 'Debug: Toggle [V]irtual text' })
-- nvim-dap's widget floats carry no syntax colours of their own, so evaluated
-- values are parsed as javascript, as the old dap-ui float did. The frames
-- float is file paths and stays plain.
local function highlight_values(view)
  pcall(vim.treesitter.start, vim.api.nvim_win_get_buf(view.win), 'javascript')
  return view
end

-- The expression the cursor is on: the whole `a.b[0].c` chain, not the one
-- identifier `<cexpr>` would return.
local function dap_expr_under_cursor()
  -- get_node raises when the buffer has no parser rather than returning nil.
  local ok, node = pcall(vim.treesitter.get_node)
  if not (ok and node) then return vim.fn.expand '<cexpr>' end
  while node:parent() and vim.tbl_contains({ 'member_expression', 'subscript_expression' }, node:parent():type()) do
    node = node:parent()
  end
  return vim.treesitter.get_node_text(node, 0)
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
      local spec = vim.deepcopy(require('dap.entity').scope.tree_spec)
      spec.extra_context = { view = view }
      view.tree = require('dap.ui').new_tree(spec)
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
vim.keymap.set({ 'n', 'v' }, '<leader>de', function() highlight_values(widgets.hover(dap_expr_under_cursor)) end, { desc = 'Debug: [E]val expression' })
-- dap-view hover: word under cursor, or the visual selection. <CR> expands, [[ parent, s set value, q closes.
vim.keymap.set({ 'n', 'v' }, '<leader>dh', function() require('dap-view').hover(nil, true) end, { desc = 'Debug: [H]over variable' })
vim.keymap.set({ 'n', 'x' }, '<leader>da', '<cmd>DapViewWatch<CR>', { desc = 'Debug: [A]dd watch' })
vim.keymap.set('n', '<leader>dw', '<cmd>DapViewJump watches<CR>', { desc = 'Debug: [W]atches pane' })
vim.keymap.set('n', '<leader>dP', '<cmd>DapViewJump repl<CR>', { desc = 'Debug: REPL [P]ane' })

-- js-debug's exception filters are `all` (caught) and `uncaught`; both are off
-- by default, as in VS Code's Breakpoints panel. Cycles none -> uncaught -> all
-- for the running sessions (the attached child included) and every later one.
local exception_filters = {
  { filters = {}, label = 'none' },
  { filters = { 'uncaught' }, label = 'uncaught' },
  { filters = { 'all' }, label = 'caught and uncaught' },
}
local exception_index = 1
vim.keymap.set('n', '<leader>dE', function()
  exception_index = exception_index % #exception_filters + 1
  local choice = exception_filters[exception_index]
  dap.defaults['pwa-node'].exception_breakpoints = choice.filters
  local function apply(sessions)
    for _, session in pairs(sessions) do
      session:set_exception_breakpoints(choice.filters)
      apply(session.children)
    end
  end
  apply(dap.sessions())
  vim.notify('Break on exceptions: ' .. choice.label, vim.log.levels.INFO)
end, { desc = 'Debug: Cycle [E]xception breakpoints' })

-- nvim-dap's widget floats map <CR>/o to expand and nothing to close.
vim.api.nvim_create_autocmd('FileType', {
  group = vim.api.nvim_create_augroup('dap_float_close', { clear = true }),
  pattern = 'dap-float',
  callback = function(args) vim.keymap.set('n', 'q', '<cmd>close<CR>', { buffer = args.buf, desc = 'Close' }) end,
})

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

require('mason-nvim-dap').setup {
  automatic_installation = true,
  handlers = {},
  ensure_installed = {
    'delve',
    'js-debug-adapter',
  },
}

-- The integrated terminal is a split under the code, owned by nvim-dap.
-- dap-view would otherwise carve the terminal out of its own panel (panel 30
-- wide, terminal 102 on the first stop) and hide it when the child session
-- exits, although the debug shell inside is still running. A string here
-- runs `belowright 15new` against the focused window, which puts the terminal
-- inside dap-view or neo-tree when the session is started from one; the
-- function anchors it on a code window instead.
dap.defaults.fallback.terminal_win_cmd = terminal.open_for_dap
dap.defaults['pwa-node'].focus_terminal = true

-- Where the stopped frame is shown. nvim-dap's default, `uselast`, targets the
-- previously focused window whenever the current one holds a terminal or the
-- panel: a dap-view pane there has winfixbuf and the jump is skipped without
-- a message, and the neo-tree window has no winfixbuf and gets the source
-- file loaded into it. `useopen` finds the window already showing the file.
dap.defaults.fallback.switchbuf = 'usevisible,useopen,uselast'

-- Two gaps in nvim-dap's own terminal handling close here. It pools terminal
-- buffers and skips terminal_win_cmd whenever the pool is not empty, so every
-- run after the first writes into a buffer with no window; and focus_terminal
-- only searches for a window, so it silently does nothing in that case.
-- Deferred one tick because the job starts inside nvim_buf_call.
vim.api.nvim_create_autocmd('TermOpen', {
  group = vim.api.nvim_create_augroup('dap_terminal_insert', { clear = true }),
  callback = function(args)
    local dap_type = vim.b[args.buf]['dap-type']
    if not dap_type then return end
    vim.schedule(function()
      if not vim.api.nvim_buf_is_valid(args.buf) then return end
      local win = terminal.reveal_dap(args.buf)
      if not dap.defaults[dap_type].focus_terminal then return end
      vim.api.nvim_set_current_win(win)
      vim.cmd.startinsert()
    end)
  end,
})

vim.fn.sign_define('DapBreakpoint', { text = '●', texthl = 'DiagnosticError', numhl = 'DiagnosticError' })
vim.fn.sign_define('DapBreakpointCondition', { text = '◆', texthl = 'DiagnosticWarn', numhl = 'DiagnosticWarn' })
vim.fn.sign_define('DapLogPoint', { text = '◉', texthl = 'DiagnosticInfo', numhl = 'DiagnosticInfo' })
vim.fn.sign_define('DapStopped', { text = '▶', texthl = 'DiagnosticOk', linehl = 'DapStoppedLine', numhl = 'DiagnosticOk' })
vim.fn.sign_define('DapBreakpointRejected', { text = '✖', texthl = 'DiagnosticError', numhl = 'DiagnosticError' })

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

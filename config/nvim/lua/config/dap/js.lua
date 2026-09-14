-- Node.js and TypeScript through js-debug-adapter (vscode-js-debug).
-- nvim-dap is added in config/dap/init.lua.

local dap = require 'dap'
local widgets = require 'config.dap.widgets'

-- Resolved per session, not at startup: `get_package` raises when mason has
-- never fetched its registry, which on a new machine aborted the rest of
-- init.lua. nvim-dap calls the function when a `pwa-node` config is run
-- (dap.lua:645), so a missing package is reported where it can be acted on.
dap.adapters['pwa-node'] = function(callback, _)
  local install_path = require('mason-registry').get_package('js-debug-adapter'):get_install_path()
  callback {
    type = 'server',
    host = 'localhost',
    port = '${port}',
    executable = {
      command = 'node',
      args = { install_path .. '/js-debug/src/dapDebugServer.js', '${port}' },
    },
  }
end

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

dap.defaults['pwa-node'].focus_terminal = true

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

vim.keymap.set('n', '<leader>dy', function()
  local session = require('dap').session()
  if not session then return end
  local expr = widgets.expr_under_cursor()
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

-- Node.js and TypeScript through js-debug-adapter (vscode-js-debug).
-- nvim-dap is added in config/dap/init.lua.

local dap = require 'dap'

-- Resolved per session, not at startup: `get_package` raises when mason has
-- never fetched its registry, which on a new machine aborted the rest of
-- init.lua. nvim-dap calls the function when a `pwa-node` config is run
-- (dap.lua:645), so a missing package is reported where it can be acted on.
dap.adapters['pwa-node'] = function(callback, config)
  -- VS Code injects __workspaceFolder into every js-debug config; without it
  -- js-debug drops ${workspaceFolder} defaults (outFiles, rootPath) and
  -- never binds source-mapped breakpoints. nvim-dap does not inject it.
  config.__workspaceFolder = config.__workspaceFolder or vim.fn.getcwd()
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

-- launch.json configs written for VS Code use `type: "node"`. VS Code's
-- js-debug extension rewrites that to `pwa-node` before the DAP server sees
-- it; the standalone server never answers an attach typed `node`.
dap.adapters.node = function(callback, config)
  config.type = 'pwa-node'
  dap.adapters['pwa-node'](callback, config)
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

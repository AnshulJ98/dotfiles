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

require('nvim-dap-virtual-text').setup()
require('dap-view').setup {
  windows = {
    position = 'right',
    size = 60,
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
    base_sections = {
      repl = { label = 'REPL', keymap = 'P' },
    },
  },
}

vim.keymap.set('n', '<F5>', function() require('dap').continue() end, { desc = 'Debug: Start/Continue' })
vim.keymap.set('n', '<F1>', function() require('dap').step_into() end, { desc = 'Debug: Step Into' })
vim.keymap.set('n', '<F2>', function() require('dap').step_over() end, { desc = 'Debug: Step Over' })
vim.keymap.set('n', '<F3>', function() require('dap').step_out() end, { desc = 'Debug: Step Out' })
vim.keymap.set('n', '<leader>b', function() require('dap').toggle_breakpoint() end, { desc = 'Debug: Toggle Breakpoint' })
vim.keymap.set('n', '<leader>B', function() require('dap').set_breakpoint(vim.fn.input 'Breakpoint condition: ') end, { desc = 'Debug: Set Breakpoint' })
vim.keymap.set('n', '<F7>', function() require('dapui').toggle() end, { desc = 'Debug: Toggle DAP UI (splits)' })
vim.keymap.set('n', '<F8>', '<cmd>DapViewToggle<CR>', { desc = 'Debug: Toggle DAP View (single window)' })
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

-- Long values in scopes/hover wrap instead of running off screen.
vim.api.nvim_create_autocmd('FileType', {
  group = vim.api.nvim_create_augroup('dap_view_wrap', { clear = true }),
  pattern = { 'dap-view', 'dap-view-hover' },
  callback = function()
    vim.wo.wrap = true
    vim.wo.linebreak = true
  end,
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

vim.fn.sign_define('DapBreakpoint', { text = '●', texthl = 'DiagnosticError', numhl = 'DiagnosticError' })
vim.fn.sign_define('DapBreakpointCondition', { text = '◆', texthl = 'DiagnosticWarn', numhl = 'DiagnosticWarn' })
vim.fn.sign_define('DapLogPoint', { text = '◉', texthl = 'DiagnosticInfo', numhl = 'DiagnosticInfo' })
vim.fn.sign_define('DapStopped', { text = '▶', texthl = 'DiagnosticOk', linehl = 'Visual', numhl = 'DiagnosticOk' })
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
  skipFiles = { '<node_internals>/**', '${workspaceFolder}/node_modules/**' },
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
      skipFiles = { '<node_internals>/**', '${workspaceFolder}/node_modules/**' },
    },
    {
      type = 'pwa-node',
      request = 'launch',
      name = 'Launch current file',
      program = '${file}',
      cwd = '${workspaceFolder}',
      runtimeArgs = { '--enable-source-maps' },
      sourceMaps = true,
      skipFiles = { '<node_internals>/**', '${workspaceFolder}/node_modules/**' },
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
      skipFiles = { '<node_internals>/**', '${workspaceFolder}/node_modules/**' },
      console = 'integratedTerminal',
    },
    {
      type = 'pwa-node',
      request = 'attach',
      name = 'Attach (port 9229)',
      port = 9229,
      cwd = '${workspaceFolder}',
      sourceMaps = true,
      skipFiles = { '<node_internals>/**', '${workspaceFolder}/node_modules/**' },
      restart = true,
    },
  }
end

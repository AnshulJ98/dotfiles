-- Python through debugpy (mason package `debugpy`, binary `debugpy-adapter`).
-- nvim-dap-python is added in config/dap/init.lua. It registers the `python`
-- adapter and the launch, launch-with-arguments, attach and doctest configs,
-- and picks the debuggee's interpreter from VIRTUAL_ENV, CONDA_PREFIX, or a
-- venv/.venv/env/.env folder in the working directory; the project itself
-- does not need debugpy installed.

local dap = require 'dap'

require('dap-python').setup 'debugpy-adapter'

-- justMyCode (on by default) steps over library frames; this config steps
-- into them, e.g. from a span's `with` exit into the OpenTelemetry SDK.
table.insert(dap.configurations.python, {
  type = 'python',
  request = 'launch',
  name = 'file (step into libraries)',
  program = '${file}',
  console = 'integratedTerminal',
  justMyCode = false,
})

dap.defaults.python.focus_terminal = true

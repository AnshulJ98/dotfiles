-- The dap-view panel. Its plugin is added in config/dap/init.lua.

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

local dap = require 'dap'

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

-- dap-view hover: word under cursor, or the visual selection. <CR> expands, [[ parent, s set value, q closes.
vim.keymap.set({ 'n', 'v' }, '<leader>dh', function() require('dap-view').hover(nil, true) end, { desc = 'Debug: [H]over variable' })
vim.keymap.set({ 'n', 'x' }, '<leader>da', '<cmd>DapViewWatch<CR>', { desc = 'Debug: [A]dd watch' })
vim.keymap.set('n', '<leader>dw', '<cmd>DapViewJump watches<CR>', { desc = 'Debug: [W]atches pane' })
vim.keymap.set('n', '<leader>dP', '<cmd>DapViewJump repl<CR>', { desc = 'Debug: REPL [P]ane' })

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

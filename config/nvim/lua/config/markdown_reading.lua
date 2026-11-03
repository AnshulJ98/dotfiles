-- Reading view for markdown, on md-render.nvim. <leader>mr swaps the window
-- between source and a read-only rendering; <leader>mo opens the rendering in a
-- kitty overlay instead, where kitty itself draws it, so the scaled headings
-- (kitty's text-sizing protocol) survive herdr, which does not pass them on.
-- Unlike render-markdown's wrapped tables (virt_lines over conceal_lines), every
-- screen row here is a buffer line, so j/k and <C-d> move one row at a time.
local MARGIN = 3 -- columns each side, about VS Code's 26px preview padding

local function blend(fg, bg, alpha)
  local out = 0
  for _, shift in ipairs { 16, 8, 0 } do
    local f, b = bit.band(bit.rshift(fg, shift), 0xff), bit.band(bit.rshift(bg, shift), 0xff)
    out = out + bit.lshift(math.floor(f * alpha + b * (1 - alpha) + 0.5), shift)
  end
  return out
end

-- md-render defines its groups with default = true, so these win.
local function highlights()
  local normal = vim.api.nvim_get_hl(0, { name = 'Normal', link = false })
  local fg, bg = normal.fg or 0xd4d4d4, normal.bg or 0x0b0e14
  for level = 1, 6 do
    vim.api.nvim_set_hl(0, 'MdRenderH' .. level, { fg = fg, bold = true })
  end
  vim.api.nvim_set_hl(0, 'MdRenderInlineCode', { fg = fg, bg = blend(0xffffff, bg, 0.12) })
  -- Table borders and the quote bar use FloatBorder; the window maps it here.
  vim.api.nvim_set_hl(0, 'MdReadingRule', { fg = blend(0xffffff, bg, 0.18) })
end

-- Render at the window's width less both margins: the default 80-column cap
-- truncated wide tables. The statuscolumn supplies the left margin.
local function fit(win) vim.g.md_render_max_width = math.max(40, vim.api.nvim_win_get_width(win) - 2 * MARGIN) end

local function toggle() vim.cmd.MdRender 'toggle' end

local function overlay(buf)
  vim.cmd 'silent update'
  local cmd = { 'kitten', '@', 'launch', '--type=overlay', '--title', 'md reading', '--cwd', vim.fn.getcwd(), '--env', 'MD_READING_OVERLAY=1' }
  if vim.env.NVIM_APPNAME then vim.list_extend(cmd, { '--env', 'NVIM_APPNAME=' .. vim.env.NVIM_APPNAME }) end
  vim.list_extend(cmd, {
    vim.fn.exepath 'nvim',
    '-R',
    '-n',
    '+' .. vim.fn.line '.',
    -- After UIEnter: md-render probes the terminal, which needs the UI attached.
    '-c',
    'autocmd UIEnter * ++once lua vim.schedule(function() vim.cmd.MdRender "toggle" end)',
    vim.api.nvim_buf_get_name(buf),
  })
  vim.system(cmd, { text = true }, function(result)
    if result.code == 0 then return end
    vim.schedule(function() vim.notify('Reading overlay: ' .. vim.trim(result.stderr), vim.log.levels.ERROR) end)
  end)
end

local group = vim.api.nvim_create_augroup('markdown-reading', { clear = true })

vim.api.nvim_create_autocmd('FileType', {
  desc = 'Reading view keymaps',
  group = group,
  pattern = 'markdown',
  callback = function(ev)
    if not vim.g.md_reading_loaded then
      vim.g.md_reading_loaded = true
      vim.pack.add { { src = 'https://github.com/delphinus/md-render.nvim', version = vim.version.range '3.*' } }
      highlights()
      vim.api.nvim_create_autocmd('ColorScheme', { group = group, callback = highlights })
    end
    vim.keymap.set('n', '<leader>mr', toggle, { buffer = ev.buf, desc = '[M]arkdown [R]eading view' })
    if vim.env.KITTY_LISTEN_ON then
      vim.keymap.set('n', '<leader>mo', function() overlay(ev.buf) end, { buffer = ev.buf, desc = '[M]arkdown reading [O]verlay (kitty)' })
    end
  end,
})

-- The rendered buffer gets no FileType event; b:md_render marks it.
vim.api.nvim_create_autocmd('BufWinEnter', {
  desc = 'Style the reading view',
  group = group,
  callback = function(ev)
    if not vim.b[ev.buf].md_render then return end
    -- Each scroll drops the scaled headings to plain size until md-render's
    -- 90-180 ms repaint; animated, every frame is a scroll and it flickers.
    vim.b[ev.buf].minianimate_disable = true
    vim.opt_local.number = false
    vim.opt_local.relativenumber = false
    vim.opt_local.signcolumn = 'no'
    vim.opt_local.foldcolumn = '0'
    vim.opt_local.statuscolumn = string.rep(' ', MARGIN)
    vim.opt_local.winhighlight = 'FloatBorder:MdReadingRule'
    vim.opt_local.fillchars:append { eob = ' ' }
    fit(vim.api.nvim_get_current_win())
    vim.keymap.set('n', '<leader>mr', toggle, { buffer = ev.buf, desc = '[M]arkdown [R]eading view' })
    if vim.env.MD_READING_OVERLAY then vim.keymap.set('n', 'q', '<cmd>qa!<CR>', { buffer = ev.buf, desc = 'Close the reading overlay' }) end

    -- Open every table expanded (cells wrap, as `za` does) rather than cut off
    -- with `…`. md-render has no option for this, so it reaches into the
    -- session's expand_state; if a release renames that, tables just stay folded.
    local ok, preview = pcall(require, 'md-render.preview')
    local session = ok and preview._sessions and preview._sessions[ev.buf]
    if session and type(session.expand_state) == 'table' and not getmetatable(session.expand_state) then
      setmetatable(session.expand_state, { __index = function() return true end })
      session:rebuild()
    end
  end,
})

vim.api.nvim_create_autocmd('WinResized', {
  desc = 'Keep the reading view at window width',
  group = group,
  callback = function()
    for _, win in ipairs(vim.v.event.windows) do
      if vim.api.nvim_win_is_valid(win) and vim.b[vim.api.nvim_win_get_buf(win)].md_render then fit(win) end
    end
  end,
})

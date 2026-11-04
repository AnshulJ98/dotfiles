-- Reading view for markdown, on md-render.nvim. <leader>mr swaps the window
-- between source and a read-only rendering with plain-size headings, the same
-- in kitty and herdr; <leader>mo opens it in a kitty overlay instead, with
-- scaled headings (kitty's text-sizing protocol), which herdr does not pass on.
-- Unlike render-markdown's wrapped tables (virt_lines over conceal_lines), every
-- screen row here is a buffer line, so j/k and <C-d> move one row at a time.
local MARGIN = 3 -- columns each side, about VS Code's 26px preview padding

-- The colours of the editing view: render-markdown's per-level heading colours
-- (colorscheme.lua), its inline-code background on @markup.raw, and in the
-- window, @markup.strong bold, bullet-blue list markers and @markup.link links.
-- md-render defines its groups with default = true, so these win.
local function highlights()
  local function hl(name) return vim.api.nvim_get_hl(0, { name = name, link = false }) end
  for level = 1, 6 do
    local band = hl('RenderMarkdownH' .. level .. 'Bg')
    vim.api.nvim_set_hl(0, 'MdRenderH' .. level, { fg = band.fg or hl('@markup.heading').fg, bg = band.bg, bold = true })
    vim.api.nvim_set_hl(0, 'MdReadingBand' .. level, { bg = band.bg })
  end
  vim.api.nvim_set_hl(0, 'MdRenderInlineCode', { fg = hl('@markup.raw').fg, bg = hl('RenderMarkdownCodeInline').bg })
end

-- Full-width bands: md-render colours only the heading text, so a decoration
-- provider paints the row behind each MdRenderH highlight, plus the blank row
-- a scaled heading reserves under itself. Drawn per redraw, so md-render's
-- rebuilds need no hook, and nothing is added to the buffer.
local band_ns = vim.api.nvim_create_namespace 'markdown-reading-band'
local band_rows = {}
vim.api.nvim_set_decoration_provider(band_ns, {
  on_win = function(_, _, buf, top, bot)
    if not vim.b[buf].md_render then return false end
    band_rows = {}
    local ok, text_size = pcall(require, 'md-render.text_size')
    local marks = vim.api.nvim_buf_get_extmarks(buf, -1, { math.max(top - 1, 0), 0 }, { bot, -1 }, { details = true, type = 'highlight' })
    for _, mark in ipairs(marks) do
      local level = tonumber(tostring(mark[4].hl_group):match '^MdRenderH(%d)$')
      if level then
        local spec = ok and text_size.spec_for(level)
        for row = mark[2], mark[2] + (spec and spec.s or 1) - 1 do
          band_rows[row] = level
        end
      end
    end
  end,
  on_line = function(_, _, buf, row)
    local level = band_rows[row]
    if level then
      vim.api.nvim_buf_set_extmark(buf, band_ns, row, 0, {
        end_row = row + 1,
        hl_group = 'MdReadingBand' .. level,
        hl_eol = true,
        priority = 1, -- under md-render's own highlights
        ephemeral = true,
      })
    end
  end,
})

-- Render at the window's width less both margins: the default 80-column cap
-- truncated wide tables. The statuscolumn supplies the left margin.
local function fit(win) vim.g.md_render_max_width = math.max(20, vim.api.nvim_win_get_width(win) - 2 * MARGIN) end

local function toggle() vim.cmd.MdRender 'toggle' end

local function overlay(buf)
  vim.cmd 'silent update'
  local cmd = {
    'kitten',
    '@',
    'launch',
    '--type=overlay',
    '--title',
    'md reading',
    '--cwd',
    vim.fn.getcwd(),
    '--env',
    'MD_READING_OVERLAY=1',
  }
  -- Over the kitty window nvim runs in (herdr's, inside herdr), not over
  -- whichever window has focus.
  if vim.env.KITTY_WINDOW_ID then vim.list_extend(cmd, { '--match', 'id:' .. vim.env.KITTY_WINDOW_ID }) end
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
      -- md-render leaves a link click to the terminal when it speaks OSC 8, but
      -- with the mouse on, nvim gets the click and kitty never sees it (and
      -- herdr sits in between). Claiming no OSC 8 makes md-render open the
      -- link itself with vim.ui.open, so a plain click works everywhere.
      local ok_du, display_utils = pcall(require, 'md-render.display_utils')
      if ok_du then display_utils.supports_osc8 = function() return false end end
      local ok_ts, text_size = pcall(require, 'md-render.text_size')
      -- In place, headings stay plain: herdr cannot show them scaled, and in
      -- kitty each scroll drops them to plain size until md-render repaints.
      if ok_ts and not vim.env.MD_READING_OVERLAY then text_size.setup { enabled = false } end
      -- md-render scales # to ###### at 2, 1.75, 1.5, 1.4, 1.25 and 1.17x, so #
      -- and ## read as the same size. VS Code's preview steps 2, 1.5, 1.25 and
      -- then body size; ## and ### borrow md-render's 1.5x and 1.25x specs and
      -- #### down stay plain. No option for this: spec_for is the one place
      -- md-render reads the scales, and if it goes the stock ladder stays.
      if ok_ts and type(text_size.spec_for) == 'function' then
        local spec_for, borrow = text_size.spec_for, { 1, 3, 5 }
        text_size.spec_for = function(level)
          if borrow[level] then return spec_for(borrow[level]) end
        end
      end
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
    if vim.env.MD_READING_OVERLAY then vim.b[ev.buf].minianimate_disable = true end
    vim.opt_local.number = false
    vim.opt_local.relativenumber = false
    vim.opt_local.signcolumn = 'no'
    vim.opt_local.foldcolumn = '0'
    vim.opt_local.statuscolumn = string.rep(' ', MARGIN)
    vim.opt_local.winhighlight = 'Bold:@markup.strong,Special:RenderMarkdownBullet,Underlined:@markup.link'
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
      setmetatable(session.expand_state, {
        __index = function() return true end,
      })
      session:rebuild()
      -- As md-render does after its own rebuilds: without it the images and
      -- scaled headings stay placed for the folded layout, so images never
      -- appear and heading bands land on the wrong rows.
      session:refresh_images()
    end
  end,
})

vim.api.nvim_create_autocmd('WinResized', {
  desc = 'Keep the reading view at window width',
  group = group,
  callback = function()
    -- A `:doautocmd WinResized` (kitty-scrollback fires one) has no window list.
    for _, win in ipairs(vim.v.event.windows or vim.api.nvim_list_wins()) do
      if vim.api.nvim_win_is_valid(win) and vim.b[vim.api.nvim_win_get_buf(win)].md_render then fit(win) end
    end
  end,
})

-- WezTerm: a light port of config/kitty/kitty.conf for machines without kitty (Windows).
-- Colours come from config/themes/current/kitty.conf, so `theme <name>` drives this too.
-- kitty's cmd+ maps become ctrl+shift+ here; workspaces, zdo/zgoto and hints are not ported.
--
--   ctrl+shift+t        new tab, current folder     ctrl+shift+alt+t   new tab, home
--   ctrl+shift+n        new window, current folder  ctrl+shift+alt+l   shell picker
--   ctrl+shift+d        split right                 ctrl+shift+alt+d   split down
--   ctrl+shift+w        close pane                  ctrl+shift+q       close tab
--   ctrl+alt+arrows     focus pane                  ctrl+shift+alt+arrows  resize pane
--   ctrl+shift+alt+f    zoom pane                   alt+1..9           go to tab
--   ctrl+shift+i        rename tab                  ctrl+shift+p       command palette
local wezterm = require("wezterm")
local act = wezterm.action
local config = wezterm.config_builder()

local is_windows = wezterm.target_triple:find("windows") ~= nil
local DOT = wezterm.home_dir .. "/Dev/dotfiles"

-- Theme -----------------------------------------------------------------------
-- Read kitty's `key value` colour lines; later lines win, as in kitty.
local function kitty_theme(path)
  local f = io.open(path, "r")
  if not f then
    return nil
  end
  local c = {}
  for line in f:lines() do
    local k, v = line:match("^%s*([%w_]+)%s+(#%x%x%x%x%x%x)")
    if k then
      c[k] = v
    end
  end
  f:close()
  return c
end

local theme_file = DOT .. "/config/themes/current/kitty.conf"
wezterm.add_to_config_reload_watch_list(theme_file)
local k = kitty_theme(theme_file)
if k then
  local ansi, brights, indexed = {}, {}, {}
  for i = 0, 7 do
    ansi[i + 1] = k["color" .. i]
    brights[i + 1] = k["color" .. (i + 8)]
  end
  -- Themes also retint xterm-256 slots (the 232-255 greys and p10k's accents) so the
  -- prompt, which uses p10k's indexed colours, follows the theme as it does in kitty.
  for i = 16, 255 do
    indexed[i] = k["color" .. i]
  end
  config.colors = {
    foreground = k.foreground,
    background = k.background,
    cursor_bg = k.cursor,
    cursor_fg = k.cursor_text_color,
    cursor_border = k.cursor,
    selection_bg = k.selection_background,
    selection_fg = k.foreground,
    split = k.active_border_color,
    ansi = ansi,
    brights = brights,
    indexed = indexed,
    tab_bar = {
      background = k.tab_bar_background,
      active_tab = { bg_color = k.active_tab_background, fg_color = k.active_tab_foreground, intensity = "Bold" },
      inactive_tab = { bg_color = k.inactive_tab_background, fg_color = k.inactive_tab_foreground },
      inactive_tab_hover = { bg_color = k.active_tab_background, fg_color = k.active_tab_foreground },
      new_tab = { bg_color = k.tab_bar_background, fg_color = k.inactive_tab_foreground },
      new_tab_hover = { bg_color = k.active_tab_background, fg_color = k.active_tab_foreground },
    },
  }
end

-- Font ------------------------------------------------------------------------
config.font = wezterm.font_with_fallback({
  "Iosevka Term",
  "Iosevka Nerd Font Mono",
  "Iosevka NF",
  "Symbols Nerd Font Mono",
})
config.harfbuzz_features = { "calt=0", "clig=0", "liga=0", "dlig=0" }
config.font_size = is_windows and 12.5 or 18.0 -- kitty's 18 is macOS points
config.line_height = 1.2

-- Cursor ----------------------------------------------------------------------
config.default_cursor_style = "SteadyBar"
config.cursor_thickness = "1.5pt"

-- Window ----------------------------------------------------------------------
config.window_background_opacity = 0.96
if is_windows then
  config.win32_system_backdrop = "Acrylic" -- kitty's background_blur
end
config.window_decorations = "INTEGRATED_BUTTONS|RESIZE" -- kitty's titlebar-only
config.window_padding = { left = 4, right = 4, top = 2, bottom = 2 }
config.inactive_pane_hsb = { saturation = 0.9, brightness = 0.6 } -- kitty's dim_opacity
config.window_close_confirmation = "NeverPrompt"
config.audible_bell = "Disabled"
config.scrollback_lines = 250000
config.initial_cols = 140
config.initial_rows = 40

-- Tab bar: top, flat, always shown ---------------------------------------------
config.use_fancy_tab_bar = false
config.tab_bar_at_bottom = false
config.hide_tab_bar_if_only_one_tab = false
config.tab_max_width = 40
config.show_new_tab_button_in_tab_bar = false

-- kitty's tab_title_template colours: ✓ green, ✗ red, ↻ magenta, ↳ yellow, π cyan.
wezterm.on("format-tab-title", function(tab)
  local title = tab.tab_title ~= "" and tab.tab_title or tab.active_pane.title
  local fg
  if k then
    if title:find("✓") then
      fg = k.color2
    elseif title:find("✗") then
      fg = k.color1
    elseif title:find("^↻") then
      fg = k.color5
    elseif title:find("^↳") then
      fg = k.color3
    elseif title:find("^π") then
      fg = k.color6
    end
  end
  local panes = #tab.panes > 1 and ("▍" .. #tab.panes .. " ") or ""
  local out = { { Text = " " } }
  if panes ~= "" and k then
    table.insert(out, { Foreground = { Color = k.color3 } })
    table.insert(out, { Text = panes })
  end
  if fg then
    table.insert(out, { Foreground = { Color = fg } })
  end
  table.insert(out, { Text = title .. " " })
  return out
end)

-- Shell -----------------------------------------------------------------------
if is_windows then
  -- PowerShell 7 if installed (scoop/winget), else the built-in 5.1; both load config/powershell/profile.ps1.
  local pwsh7 = io.open(wezterm.home_dir .. "/scoop/shims/pwsh.exe", "r")
    or io.open("C:/Program Files/PowerShell/7/pwsh.exe", "r")
  if pwsh7 then
    pwsh7:close()
  end
  -- Load the repo profile directly: $PROFILE sits in OneDrive and breaks when its client is not running.
  local function ps(exe)
    return { exe, "-NoLogo", "-NoProfile", "-NoExit", "-Command", ". '" .. DOT .. "/config/powershell/profile.ps1'" }
  end
  local powershell = ps(pwsh7 and "pwsh.exe" or "powershell.exe")
  local git_bash = { "C:/Program Files/Git/bin/bash.exe", "-l", "-i" }
  config.default_prog = powershell
  config.launch_menu = {
    { label = "PowerShell", args = powershell },
    { label = "Windows PowerShell 5.1", args = ps("powershell.exe") },
    { label = "Git Bash", args = git_bash },
    { label = "WSL Ubuntu", args = { "wsl.exe", "-d", "Ubuntu", "--cd", "~" } },
  }
end
config.default_cwd = wezterm.home_dir

-- Keys ------------------------------------------------------------------------
-- pi: kitty keyboard protocol for shift+enter, and alt+enter queues a follow-up
-- (WezTerm would otherwise take it for fullscreen). See pi docs/terminal-setup.md.
config.enable_kitty_keyboard = true
local CS = "CTRL|SHIFT"
config.keys = {
  { key = "Enter", mods = "ALT", action = act.SendString("\x1b[13;3u") },
  { key = "F11", mods = "NONE", action = act.ToggleFullScreen },
  -- tabs, windows and panes. New ones open in the current pane's folder (the prompt reports
  -- it with OSC 7); kitty's cmd+t / cmd+shift+t / cmd+n / cmd+w / cmd+d / cmd+shift+d.
  { key = "t", mods = CS, action = act.SpawnTab("CurrentPaneDomain") },
  { key = "t", mods = CS .. "|ALT", action = act.SpawnCommandInNewTab({ cwd = wezterm.home_dir }) },
  { key = "n", mods = CS, action = act.SpawnCommandInNewWindow({ domain = "CurrentPaneDomain" }) },
  { key = "w", mods = CS, action = act.CloseCurrentPane({ confirm = false }) },
  { key = "q", mods = CS, action = act.CloseCurrentTab({ confirm = false }) },
  { key = "d", mods = CS, action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
  { key = "d", mods = CS .. "|ALT", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
  { key = "i", mods = CS, action = act.PromptInputLine({
    description = "Tab title",
    action = wezterm.action_callback(function(window, _, line)
      if line then
        window:active_tab():set_title(line)
      end
    end),
  }) },
  -- pane focus / resize / stack (kitty cmd+opt+arrows, cmd+ctrl+arrows, cmd+alt+f)
  { key = "LeftArrow", mods = "CTRL|ALT", action = act.ActivatePaneDirection("Left") },
  { key = "RightArrow", mods = "CTRL|ALT", action = act.ActivatePaneDirection("Right") },
  { key = "UpArrow", mods = "CTRL|ALT", action = act.ActivatePaneDirection("Up") },
  { key = "DownArrow", mods = "CTRL|ALT", action = act.ActivatePaneDirection("Down") },
  { key = "LeftArrow", mods = CS .. "|ALT", action = act.AdjustPaneSize({ "Left", 2 }) },
  { key = "RightArrow", mods = CS .. "|ALT", action = act.AdjustPaneSize({ "Right", 2 }) },
  { key = "UpArrow", mods = CS .. "|ALT", action = act.AdjustPaneSize({ "Up", 2 }) },
  { key = "DownArrow", mods = CS .. "|ALT", action = act.AdjustPaneSize({ "Down", 2 }) },
  { key = "f", mods = CS .. "|ALT", action = act.TogglePaneZoomState },
  { key = "]", mods = CS, action = act.ActivatePaneDirection("Next") },
  { key = "[", mods = CS, action = act.ActivatePaneDirection("Prev") },
  -- launcher (shells), font size
  { key = "l", mods = CS .. "|ALT", action = act.ShowLauncherArgs({ flags = "LAUNCH_MENU_ITEMS" }) },
  { key = "=", mods = "CTRL", action = act.IncreaseFontSize },
  { key = "-", mods = "CTRL", action = act.DecreaseFontSize },
  { key = "0", mods = "CTRL", action = act.ResetFontSize },
}
-- alt+1..9 → tab n (kitty cmd+1..9)
for i = 1, 9 do
  table.insert(config.keys, { key = tostring(i), mods = "ALT", action = act.ActivateTab(i - 1) })
end

-- ctrl+click opens links (kitty cmd+click)
config.mouse_bindings = {
  { event = { Up = { streak = 1, button = "Left" } }, mods = "NONE", action = act.CompleteSelection("ClipboardAndPrimarySelection") },
  { event = { Up = { streak = 1, button = "Left" } }, mods = "CTRL", action = act.OpenLinkAtMouseCursor },
  { event = { Down = { streak = 1, button = "Left" } }, mods = "CTRL", action = act.Nop },
}

-- Per-machine overrides: config/wezterm/local.lua (gitignored), returning function(config).
local ok, local_cfg = pcall(dofile, DOT .. "/config/wezterm/local.lua")
if ok and type(local_cfg) == "function" then
  local_cfg(config)
end

return config

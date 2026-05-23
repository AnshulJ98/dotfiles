-- ~/.wezterm.lua
-- WezTerm configuration — Bearded Theme Monokai Black Pro Filter
--
-- Features:
--   * Iosevka Nerd Font with disabled discretionary ligatures
--   * Custom Bearded Monokai Black Pro Filter colorscheme
--   * Semi-transparent background with vibrancy/blur effect
--   * Borderless window (title bar hidden, resizable borders preserved)
--   * Generous scrollback
--   * Kitty graphics protocol for image.nvim support
--   * Global hotkey for quick/dropdown terminal (Ctrl+`)

local wezterm = require("wezterm")

local config = wezterm.config_builder()

-- Font configuration
config.font = wezterm.font_with_fallback({
	"Iosevka Nerd Font",
	-- Add fallbacks if needed, e.g., for emoji
	"Apple Color Emoji",
})
config.font_size = 16.0

-- Disable discretionary ligatures globally (equivalent to Ghostty's -dlig)
config.harfbuzz_features = { "dlig=0" }

-- Appearance — Bearded Theme Monokai Black Pro Filter
-- Custom color scheme defined inline (replaces built-in PaulMillr)
-- Cursor style: I-beam (line)
config.default_cursor_style = "SteadyBar"

config.colors = {
	foreground = "#c7c7c7",
	background = "#0a0a0a",
	cursor_bg = "#ffee00",
	cursor_fg = "#0a0a0a",
	cursor_border = "#ffee00",
	selection_bg = "#3b3b3b",
	selection_fg = "#c7c7c7",
	scrollbar_thumb = "#545454",
	split = "#050505",
	ansi = { "#141414", "#ff5555", "#66ff88", "#ffee00", "#44ddff", "#ff44ff", "#44ffcc", "#c7c7c7" },
	brights = { "#444444", "#ff3333", "#88ff44", "#ffee00", "#00eeff", "#ff44ff", "#00ffcc", "#fafafa" },
	tab_bar = {
		background = "#060606",
		active_tab = { bg_color = "#141414", fg_color = "#c7c7c7" },
		inactive_tab = { bg_color = "#0e0e0e", fg_color = "#545454" },
		inactive_tab_hover = { bg_color = "#111111", fg_color = "#8f8f8f" },
		new_tab = { bg_color = "#0e0e0e", fg_color = "#545454" },
		new_tab_hover = { bg_color = "#111111", fg_color = "#8f8f8f" },
	},
}

config.window_background_opacity = 0.90
config.macos_window_background_blur = 20 -- Vibrancy/blur radius (macOS only)

-- Hide title bar but keep resizable borders (closest to Ghostty's window-decoration=none)
config.window_decorations = "RESIZE"
config.adjust_window_size_when_changing_font_size = false
config.tiling_desktop_environments = { "AeroSpace", "i3", "sway" } -- Extend default list
-- Minimal padding (Ghostty uses 2px horizontal)
config.window_padding = {
	left = 2,
	right = 2,
	top = 2,
	bottom = 2,
}

-- Tab bar (optional - hide if only one tab for cleaner look)
config.enable_tab_bar = true
config.hide_tab_bar_if_only_one_tab = true
config.use_fancy_tab_bar = false -- Retro style is simpler; set true for native look

-- Scrollback (very large, effectively unlimited for practical use)
config.scrollback_lines = 100000

-- WezTerm supports the kitty graphics protocol natively (no config needed)
-- TERM defaults to xterm-256color which has broad compatibility

-- Quick terminal (dropdown-like) via global hotkey
-- Uses Ctrl+` (grave accent) globally, spawning or toggling a dedicated window
wezterm.on("gui-startup", function(cmd)
	local _, _, window = wezterm.mux.spawn_window(cmd or {})
	-- window:gui_window():toggle_fullscreen()  -- Optional: start maximized if preferred
end)

config.keys = {
	-- Global hotkey: Ctrl+` toggles a quick terminal window
	{
		key = "`",
		mods = "CTRL",
		action = wezterm.action.SpawnWindow,
	},

	-- Additional useful defaults (feel free to customize)
	{ key = "Enter", mods = "CMD", action = wezterm.action.SpawnTab("CurrentPaneDomain") },
	{ key = "w", mods = "CMD", action = wezterm.action.CloseCurrentPane({ confirm = true }) },
	-- Rebind OPT-Left, OPT-Right as ALT-b, ALT-f respectively to match Terminal.app behavior
	{
		key = "LeftArrow",
		mods = "OPT",
		action = wezterm.action.SendKey({
			key = "b",
			mods = "ALT",
		}),
	},
	{
		key = "RightArrow",
		mods = "OPT",
		action = wezterm.action.SendKey({ key = "f", mods = "ALT" }),
	},
	-- Command palette
	{ key = "p", mods = "CMD|SHIFT", action = wezterm.action.ActivateCommandPalette },
	-- New window
	{ key = "n", mods = "CMD", action = wezterm.action.SpawnWindow },
}

return config

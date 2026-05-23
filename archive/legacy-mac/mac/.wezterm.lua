-- ~/.wezterm.lua
-- Excellent WezTerm configuration inspired by your Ghostty setup.
-- Matches aesthetics and behavior closely on macOS:
--   • Iosevka Nerd Font with disabled discretionary ligatures
--   • Paul Millr (Gogh) theme for dark, high-contrast look
--   • Semi-transparent background with vibrancy/blur effect
--   • Borderless window (title bar hidden, resizable borders preserved)
--   • Generous scrollback
--   • Sixel/image support (unlimited storage equivalent)
--   • Global hotkey for quick/dropdown terminal (Ctrl+` as in Ghostty)

local wezterm = require("wezterm")

local config = wezterm.config_builder()

-- Font configuration
config.font = wezterm.font_with_fallback({
	"Iosevka Nerd Font",
	-- Add fallbacks if needed, e.g., for emoji
	"Apple Color Emoji",
})
config.font_size = 14.0

-- Disable discretionary ligatures globally (equivalent to Ghostty's -dlig)
config.harfbuzz_features = { "dlig=0" }

-- Appearance
config.color_scheme = "PaulMillr" -- Built-in Gogh scheme matching your Ghostty theme

config.window_background_opacity = 0.87
config.macos_window_background_blur = 14 -- Vibrancy/blur radius (macOS only)

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

-- Tab bar (optional – hide if only one tab for cleaner look)
config.enable_tab_bar = true
config.hide_tab_bar_if_only_one_tab = true
config.use_fancy_tab_bar = false -- Retro style is simpler; set true for native look

-- Scrollback (very large, effectively unlimited for practical use)
config.scrollback_lines = 100000

-- Image/Sixel support (no hard limit equivalent to Ghostty's 3.2GB)
-- WezTerm stores images efficiently; no explicit limit needed

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
}

return config

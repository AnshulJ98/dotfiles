# Bearded Monokai Black — Master Palette

## Core Colors

| Token | Hex | Use |
|-------|-----|-----|
| `bg` | `#141414` | Main background |
| `bg_dark` | `#0e0e0e` | Dark chrome surface |
| `bg_panel` | `#111111` | Panel surface |
| `fg` | `#c7c7c7` | Primary foreground |
| `fg_muted` | `#545454` | Comments, dim chrome |
| `yellow` | `#ffee00` | Cursor, keywords, primary accent |
| `red` | `#ff5555` | Errors, critical states |
| `green` | `#66ff88` | Strings, success |
| `cyan` | `#44ddff` | Functions, links, info |
| `magenta` | `#ff44ff` | Parameters, decorators |
| `orange` | `#ff8844` | Warnings, numbers, dirty states |
| `pink` | `#ff3377` | Variables, identifiers |
| `purple` | `#cc88ff` | Types, models |
| `teal` | `#44ffcc` | Special, hint accent |

## ANSI Escape Sequences (for shell scripts)

```bash
YELLOW=$'\e[38;2;255;238;0m'
RED=$'\e[38;2;255;85;85m'
GREEN=$'\e[38;2;102;255;136m'
CYAN=$'\e[38;2;68;221;255m'
MAGENTA=$'\e[38;2;255;68;255m'
PURPLE=$'\e[38;2;204;136;255m'
ORANGE=$'\e[38;2;255;136;68m'
PINK=$'\e[38;2;255;51;119m'
TEAL=$'\e[38;2;68;255;204m'
FG=$'\e[38;2;199;199;199m'
FG_MUTED=$'\e[38;2;84;84;84m'
BG=$'\e[48;2;20;20;20m'
RESET=$'\e[0m'
```

## Per-Tool Theme Selection

| Tool | What to configure |
|------|------------------|
| VS Code Insiders | `Bearded Theme Monokai Black Pro Filter` |
| OpenCode | `bearded-monokai-black` in tui.json |
| Neovim | `bearded-monokai` colorscheme |
| Kitty | Inline colors in kitty.conf |
| Ghostty | Inline colors in config (`background = #0a0a0a`) |
| Copilot CLI | `"theme": "dark"` — Bearded feel from terminal palette |

## Font: IosevkaTerm Nerd Font

All tools: `IosevkaTerm Nerd Font` / `IosevkaTerm Nerd Font Mono`, size `16`

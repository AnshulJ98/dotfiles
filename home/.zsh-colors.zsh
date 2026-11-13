# Colours the shell sets itself, written as ANSI indexes so they follow whichever kitty theme is loaded.
# Same file for every theme. Source it at the end of ~/.zshrc (after the plugins and ~/.p10k.zsh).

# GNU ls, fd, eza and zsh completion. The built-in defaults put text on coloured backgrounds (white on red,
# blue on green), which no palette can keep readable; these use foreground, bold and underline only.
export LS_COLORS='di=1;34:ln=36:so=35:pi=33:ex=32:bd=1;33:cd=33:su=1;31:sg=1;33:tw=4;34:ow=34:st=4;34:or=4;31:mi=4;31:ca=31'
export LSCOLORS='ExgxfxdxcxDxdxBxDxExEx'
# The switcher rebuilds bat's cached current theme after relinking it.
export BAT_THEME=current

# Was fg=#666666,bold: a fixed grey that ignores the theme. Bright black is held near 4:1 in every palette.
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'

# fast-syntax-highlighting defaults that paint a background or use black as text.
FAST_HIGHLIGHT_STYLES[comment]='fg=8'
FAST_HIGHLIGHT_STYLES[global-alias]='fg=blue,underline'
FAST_HIGHLIGHT_STYLES[case-condition]='fg=blue,bold'
FAST_HIGHLIGHT_STYLES[paired-bracket]='fg=yellow,bold,underline'
FAST_HIGHLIGHT_STYLES[here-string-text]='fg=yellow'
FAST_HIGHLIGHT_STYLES[here-string-var]='fg=cyan'
FAST_HIGHLIGHT_STYLES[subtle-bg]='underline'

# powerlevel10k: the 256-colour indexes it uses are generated from the theme by kitty (palette_generate), so most of the
# prompt already follows. These are the shown segments that came out under 4.5:1 on at least one palette.
typeset -g POWERLEVEL9K_DIR_FOREGROUND=4
typeset -g POWERLEVEL9K_DIR_ANCHOR_FOREGROUND=12
typeset -g POWERLEVEL9K_STATUS_OK_FOREGROUND=2
typeset -g POWERLEVEL9K_STATUS_OK_PIPE_FOREGROUND=2
typeset -g POWERLEVEL9K_STATUS_ERROR_FOREGROUND=1
typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL_FOREGROUND=1
typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE_FOREGROUND=1
typeset -g POWERLEVEL9K_VCS_LOADING_VISUAL_IDENTIFIER_COLOR=8

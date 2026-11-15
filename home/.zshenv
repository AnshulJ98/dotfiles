[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
# Non-interactive ssh (ssh host zmx-pick, kitty host workspaces) reads only this file.
[[ ":$PATH:" == *":$HOME/.local/bin:"* ]] || export PATH="$HOME/.local/bin:$PATH"
# Headless soffice (office skills) on the Mac sees only its bundled fonts unless
# FONTCONFIG_FILE names a config; ours adds Office's fonts (Aptos) to Homebrew's.
[[ -f /opt/homebrew/etc/fonts/fonts.conf ]] && export FONTCONFIG_FILE="$HOME/.config/fontconfig/fonts.conf"

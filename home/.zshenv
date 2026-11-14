[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
# Non-interactive ssh (ssh host zmx-pick, kitty host workspaces) reads only this file.
[[ ":$PATH:" == *":$HOME/.local/bin:"* ]] || export PATH="$HOME/.local/bin:$PATH"

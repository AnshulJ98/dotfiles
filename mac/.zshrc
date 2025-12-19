# === P10K ===
# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# === Starship Prompt ===
#eval "$(starship init zsh)"

# === Basic Zsh Options ===
HISTFILE=~/.zsh_history
HISTSIZE=50000
SAVEHIST=50000
setopt INC_APPEND_HISTORY
setopt SHARE_HISTORY
setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt HIST_SAVE_NO_DUPS
setopt HIST_REDUCE_BLANKS
setopt HIST_VERIFY

# === Keybinds ===
autoload -U up-line-or-beginning-search
autoload -U down-line-or-beginning-search
zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search
bindkey "^[[A" up-line-or-beginning-search # Up
bindkey "^[[B" down-line-or-beginning-search # Down

# Modern completion
autoload -Uz compinit && compinit
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'  # case-insensitive

# === Plugins (fast, direct load) ===
source ~/.zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#666666,bold"  # Subtle suggestion

# Syntax highlighting (defer-loaded internally)
source ~/.zsh/plugins/fast-syntax-highlighting/fast-syntax-highlighting.plugin.zsh

# zsh-autosuggestions
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh

# === PATH & Environment ===
export PATH="$HOME/bin:/opt/homebrew/bin:$PATH"
export PATH="$PATH:$HOME/.local/bin"

# Editor
export EDITOR='nvim'  # or 'nvim' if you switch

# === Lazy Load NVM ===
export NVM_DIR="$HOME/.nvm"
nvm() {
  unset -f nvm node npm
  [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
  [ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
  nvm "$@"
}
node() { nvm; node "$@"; }
npm() { nvm; npm "$@"; }

# === Other Tool Activations ===
[[ -f "$HOME/.langflow/uv/env" ]] && source "$HOME/.langflow/uv/env"
[[ -f "$HOME/.local/bin/env" ]] && source "$HOME/.local/bin/env"

# VSCode shell integration
[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path zsh)"

# === Aliases ===
alias c='clear'
alias ls='ls --color=auto'
alias la='ls -la'
alias ll='ls -l'
alias vim='nvim'
alias ..='cd ..'
alias ...='cd ../..'

# === Load P10K ===
source ~/.zsh/plugins/powerlevel10k/powerlevel10k.zsh-theme

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

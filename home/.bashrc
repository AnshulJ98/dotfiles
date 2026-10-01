. "$HOME/.langflow/uv/env"

. "$HOME/.local/bin/env"
. "$HOME/.cargo/env"
   
eval "$(starship init bash)"

# >>> termium >>>
case ":$PATH:" in *:"$HOME/.local/bin":*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac
# <<< termium <<<

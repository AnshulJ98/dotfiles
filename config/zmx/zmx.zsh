# Sourced by ~/.zshrc. zmx attach NAME goes through zmx-pick, so ctrl+\ in a session entered by
# hand comes back to the picker too. Any other zmx command, or attach with a command, is unchanged.
zmx() {
  if [[ $1 == attach && $# == 2 ]] && (( $+commands[zmx-pick] )); then
    zmx-pick "$2"
  else
    command zmx "$@"
  fi
}

# ctrl+\ at a prompt outside zmx (a plain ssh shell, any terminal): the picker, then back here.
# Inside a session zmx's detach key has it first; in kitty, kitty does (bin/zgoto).
if [[ -o interactive && -z $ZMX_SESSION ]]; then
  _zmx_pick_key() {
    zle -I
    ZMX_PICK_ESC=return zmx-pick </dev/tty
    zle reset-prompt
  }
  zle -N _zmx_pick_key
  stty quit undef 2>/dev/null # else the terminal turns ctrl+\ into SIGQUIT before zle sees it
  bindkey '^\' _zmx_pick_key
fi

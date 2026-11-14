# Sourced by ~/.zshrc. zmx attach NAME goes through zmx-pick, so ctrl+\ in a session entered by
# hand comes back to the picker too. Any other zmx command, or attach with a command, is unchanged.
zmx() {
  if [[ $1 == attach && $# == 2 ]] && (( $+commands[zmx-pick] )); then
    zmx-pick "$2"
  else
    command zmx "$@"
  fi
}

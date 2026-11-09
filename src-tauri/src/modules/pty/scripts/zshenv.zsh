# estate-shell-integration (zshenv)
# Modified by ygreat for Estate, 2026. Originally part of Terax.
#
# Estate points ZDOTDIR at its integration directory so zsh reads these wrappers
# first. The user's files are sourced with ZDOTDIR switched back to their own
# directory, so `$ZDOTDIR/conf.d/*.zsh` style loaders resolve where they expect.
# A ZDOTDIR the user's .zshenv sets itself is remembered in ESTATE_USER_ZDOTDIR,
# otherwise zsh would continue with their .zshrc and skip ours.
#
# Trailing `:` is load-bearing — without it, a missing user .zshenv leaves $?=1,
# which propagates through the rest of init and ultimately into the first
# prompt's `%?` (rendering robbyrussell's `➜` red on a clean shell start).
{
  _estate_zdotdir="$ZDOTDIR"
  _estate_assigned="${ESTATE_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_estate_assigned"
  [ -f "$_estate_assigned/.zshenv" ] && source "$_estate_assigned/.zshenv"
  if [[ "${ZDOTDIR-}" != "$_estate_assigned" || -n "${ESTATE_USER_ZDOTDIR-}" ]]; then
    export ESTATE_USER_ZDOTDIR="${ZDOTDIR:-$HOME}"
  fi
  # An interactive shell goes on to our .zprofile and .zshrc; a script or
  # `zsh -c` reads nothing else, so it keeps the user's own ZDOTDIR.
  if [[ -o interactive ]]; then
    ZDOTDIR="$_estate_zdotdir"
  elif [[ -n "${ESTATE_USER_ZDOTDIR-}" ]]; then
    ZDOTDIR="$ESTATE_USER_ZDOTDIR"
  else
    unset ZDOTDIR
  fi
  unset _estate_zdotdir _estate_assigned
}
:

# estate-shell-integration (zprofile)
# Modified by ygreat for Estate, 2026. Originally part of Terax.
#
# See zshenv.zsh for how ZDOTDIR is handled and the rationale on the trailing `:`.
{
  _estate_zdotdir="$ZDOTDIR"
  _estate_user_zdotdir="${ESTATE_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_estate_user_zdotdir"
  [ -f "$_estate_user_zdotdir/.zprofile" ] && source "$_estate_user_zdotdir/.zprofile"
  if [[ "${ZDOTDIR-}" != "$_estate_user_zdotdir" || -n "${ESTATE_USER_ZDOTDIR-}" ]]; then
    export ESTATE_USER_ZDOTDIR="${ZDOTDIR:-$HOME}"
  fi
  ZDOTDIR="$_estate_zdotdir"
  unset _estate_zdotdir _estate_user_zdotdir
}
:

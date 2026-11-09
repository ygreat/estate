# estate-shell-integration (zlogin)
# Modified by ygreat for Estate, 2026. Originally part of Terax.
#
# zshrc.zsh normally hands ZDOTDIR back to the user, so zsh reads their own
# .zlogin directly and this file is not used. It stays for shells that reach it
# with the integration directory still in place.
#
# It is the LAST init file zsh runs before entering the prompt loop, so its
# exit status becomes `$?` for the very first prompt. Without the trailing `:`,
# users without a personal ~/.zlogin (the common case) hit a non-zero $? on
# first render — themes that condition prompt color on `%?` (robbyrussell etc.)
# show a red error indicator on a clean shell start.
{
  _estate_zdotdir="$ZDOTDIR"
  _estate_user_zdotdir="${ESTATE_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_estate_user_zdotdir"
  [ -f "$_estate_user_zdotdir/.zlogin" ] && source "$_estate_user_zdotdir/.zlogin"
  ZDOTDIR="$_estate_zdotdir"
  unset _estate_zdotdir _estate_user_zdotdir
}
:

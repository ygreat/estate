# estate-shell-integration (bashrc)
# Modified by ygreat for Estate, 2026. Originally part of Terax.
#
# Differences vs zsh integration:
# - We emulate login-shell init manually (/etc/profile, profile files) because
#   bash ignores --rcfile when started with -l.
# - Pre-exec marker uses PS0 (bash 4.4+). On older bash (macOS default 3.2) we
#   skip it — a fragile DEBUG-trap alternative would clobber the user's own
#   traps and interact badly with debuggers.

if [ -z "${__ESTATE_HOOKS_LOADED-}" ]; then
  __ESTATE_HOOKS_LOADED=1

  [ -f /etc/profile ] && source /etc/profile
  [ -f /etc/bashrc ] && source /etc/bashrc
  if [ -f "$HOME/.bash_profile" ]; then
    source "$HOME/.bash_profile"
  elif [ -f "$HOME/.bash_login" ]; then
    source "$HOME/.bash_login"
  elif [ -f "$HOME/.profile" ]; then
    source "$HOME/.profile"
  fi
  # .bashrc may have been sourced already by .bash_profile; sourcing again is
  # safe for idempotent rc files (the common case). If yours has side effects
  # on reload, guard with a flag.
  [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

  _estate_prompt_end='\[\e]133;B\e\\\]'
  _estate_prompt_end_first=
  if [ "${BASH_VERSINFO[0]:-0}" -lt 4 ] \
     || { [ "${BASH_VERSINFO[0]:-0}" -eq 4 ] && [ "${BASH_VERSINFO[1]:-0}" -lt 4 ]; }; then
    unset ESTATE_BLOCKS
    _estate_prompt_end='\[\e]133;B;terax_blocks=0\e\\\]'
    # Readline before bash 4.4 counts \[...\] text as visible once it falls
    # on the second line of a wrapped prompt, and every keystroke then lands
    # that many columns too far right. At the start it is always on line one.
    _estate_prompt_end_first=1
  fi

  if [ -n "${ESTATE_CLI-}" ] && [ -x "${ESTATE_CLI-}" ]; then
    estate() {
      command "$ESTATE_CLI" "$@"
    }
  fi

  # URL-encodes $1 into REPLY; no command substitution, a fork per prompt is
  # pure latency.
  _estate_urlencode() {
    local LC_ALL=C s="$1" i c
    REPLY=
    for (( i=0; i<${#s}; i++ )); do
      c="${s:i:1}"
      case "$c" in
        [a-zA-Z0-9/._~-]) REPLY+="$c" ;;
        *) printf -v c '%%%02X' "'$c"; REPLY+="$c" ;;
      esac
    done
  }

  # Reports the prompt for the command status in $1; forks nothing.
  _estate_report() {
    local _estate_cwd="$PWD" REPLY
    printf '\e]133;D;%s\e\\' "$1"
    case "$_estate_cwd" in
      *[!a-zA-Z0-9/._~-]*) _estate_urlencode "$_estate_cwd"; _estate_cwd="$REPLY" ;;
    esac
    printf '\e]7;file://%s%s\e\\' "${HOSTNAME:-localhost}" "$_estate_cwd"
    printf '\e]133;A\e\\'
  }

  # Returns the status it was called with, so the PROMPT_COMMAND entries after
  # it (starship, direnv, ...) still see the user's `$?`.
  _estate_precmd() {
    local _estate_ret=$?
    _estate_report "$_estate_ret"
    return "$_estate_ret"
  }

  # Runs last in PROMPT_COMMAND, after every prompt framework (starship, ...)
  # rebuilt PS1: the prompt end goes after the prompt text, and in block mode
  # the shell prompt is suppressed for the host's input bar. Appended again
  # whenever a framework dropped it; forks nothing.
  _estate_finish_prompt() {
    local _estate_ret=$?
    if [ -n "${ESTATE_BLOCKS-}" ]; then
      # Host renders its own input bar: suppress the shell prompt (B marker
      # only) and reserve header/gap rows, mirroring the zsh integration.
      if [ -n "${_estate_block_seen-}" ]; then
        PS1='\n\n\[\e]133;B\e\\\]'
      else
        PS1='\n\[\e]133;B\e\\\]'
      fi
    else
      case "${PS1-}" in
        *']133;B'*) ;;
        *)
          if [ -n "$_estate_prompt_end_first" ]; then
            PS1="${_estate_prompt_end}${PS1-}"
          else
            PS1="${PS1-}${_estate_prompt_end}"
          fi
          ;;
      esac
    fi
    return "$_estate_ret"
  }

  # bash 5.1 runs every element of an array PROMPT_COMMAND; older versions run
  # only element 0, where the array has to be treated as one command string.
  _estate_pc_runs_arrays() {
    [ "${BASH_VERSINFO[0]:-0}" -gt 5 ] \
      || { [ "${BASH_VERSINFO[0]:-0}" -eq 5 ] && [ "${BASH_VERSINFO[1]:-0}" -ge 1 ]; }
  }

  # Bash versions that execute all entries also expose variable attributes
  # without a fork. Testing index 1 misses empty, single and sparse arrays.
  _estate_pc_is_array() {
    if _estate_pc_runs_arrays; then
      # Attribute expansion on an unset array trips nounset; restore options
      # automatically when this function returns.
      local -
      set +u
      [[ ${PROMPT_COMMAND@a} == *a* ]]
    else
      [ -n "${PROMPT_COMMAND[1]+set}" ]
    fi
  }

  # Puts _estate_finish_prompt last in PROMPT_COMMAND, once. Called again by the
  # ble.sh hook, which restores a PROMPT_COMMAND that never saw it.
  _estate_pc_finish_last() {
    case "${PROMPT_COMMAND[*]-}" in *_estate_finish_prompt*) return 0 ;; esac
    if _estate_pc_is_array; then
      if _estate_pc_runs_arrays; then
        PROMPT_COMMAND+=(_estate_finish_prompt)
      else
        PROMPT_COMMAND[0]="${PROMPT_COMMAND[0]-}"$'\n'"_estate_finish_prompt"
      fi
    else
      PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND$'\n'}_estate_finish_prompt"
    fi
  }

  # ble.sh runs this from its own PRECMD hook list (see below). When a
  # PROMPT_COMMAND that still names _estate_precmd is going to run anyway, as it
  # does for a ble.sh that attaches from the prompt, this only makes sure the
  # prompt end still runs last, so the prompt is never reported twice.
  _estate_ble_precmd() {
    local _estate_ret=$?
    case "${PROMPT_COMMAND[*]-}" in
      *_estate_precmd*) ;;
      *) _estate_report "$_estate_ret" ;;
    esac
    _estate_pc_finish_last
    return "$_estate_ret"
  }

  if _estate_pc_is_array; then
    if _estate_pc_runs_arrays; then
      _estate_has_precmd=
      for _estate_command in "${PROMPT_COMMAND[@]}"; do
        [ "$_estate_command" = _estate_precmd ] && _estate_has_precmd=1
      done
      if [ -z "$_estate_has_precmd" ]; then
        PROMPT_COMMAND=(_estate_precmd "${PROMPT_COMMAND[@]}")
      fi
      unset _estate_has_precmd _estate_command
    else
      case "${PROMPT_COMMAND[0]-}" in
        *_estate_precmd*) ;;
        *) PROMPT_COMMAND[0]="_estate_precmd${PROMPT_COMMAND[0]:+;${PROMPT_COMMAND[0]}}" ;;
      esac
    fi
  else
    case "${PROMPT_COMMAND:-}" in
      *_estate_precmd*) ;;
      *) PROMPT_COMMAND="_estate_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
    esac
  fi
  _estate_pc_finish_last

  # An attached ble.sh keeps its own copy of PROMPT_COMMAND, restores it before
  # every prompt and drops what was added behind its back, so the hook above
  # is never called and the host sees one OSC 7 at startup and nothing after.
  # Its own hook list survives that; `!=` adds an entry only once.
  if [ -n "${BLE_VERSION-}" ] && declare -F blehook >/dev/null 2>&1; then
    blehook PRECMD!=_estate_ble_precmd 2>/dev/null \
      || blehook PRECMD+=_estate_ble_precmd 2>/dev/null
  fi

  # Pre-exec marker via PS0 (bash 4.4+). PS0 is expanded just before a command
  # runs — cleaner than a DEBUG trap, which would clobber user traps and fire
  # on every command including inside PROMPT_COMMAND.
  if [ "${BASH_VERSINFO[0]:-0}" -gt 4 ] \
     || { [ "${BASH_VERSINFO[0]:-0}" -eq 4 ] && [ "${BASH_VERSINFO[1]:-0}" -ge 4 ]; }; then
    if [ -n "${ESTATE_BLOCKS-}" ]; then
      # PS0 only expands, never executes: the arithmetic inside the array
      # subscript sets the seen flag while the unset array expands to nothing.
      PS0='\[\e]133;C\e\\\]${_estate_noop[$((_estate_block_seen=1))]-}'"${PS0:-}"
    else
      PS0='\[\e]133;C\e\\\]'"${PS0:-}"
    fi
  fi

  _estate_precmd
fi
:

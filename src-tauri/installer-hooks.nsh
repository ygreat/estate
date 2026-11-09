; Modified by ygreat for Estate, 2026. Originally part of Terax.
; "Open in Estate" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInEstate" "" "Open in Estate"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInEstate" "Icon" '"$INSTDIR\estate.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInEstate" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInEstate\command" "" '"$INSTDIR\estate.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInEstate" "" "Open in Estate"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInEstate" "Icon" '"$INSTDIR\estate.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInEstate" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInEstate\command" "" '"$INSTDIR\estate.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInEstate" "" "Open in Estate"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInEstate" "Icon" '"$INSTDIR\estate.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInEstate" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInEstate\command" "" '"$INSTDIR\estate.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInEstate"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInEstate"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInEstate"
!macroend

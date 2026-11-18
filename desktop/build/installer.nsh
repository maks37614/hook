!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "${__FILEDIR__}\installer-locales.nsh"

; This include is parsed before electron-builder includes MUI2.nsh.
; Set the standard MUI header controls directly, after the dialog exists.
!macro h00kSetHeader TITLE SUBTITLE
  GetDlgItem $R7 $HWNDPARENT 1037
  SendMessage $R7 12 0 "STR:${TITLE}"
  GetDlgItem $R7 $HWNDPARENT 1038
  SendMessage $R7 12 0 "STR:${SUBTITLE}"
!macroend


; The installer language selector is the first page. English is the default.
!ifndef BUILD_UNINSTALLER
Var /GLOBAL h00kShortcutCheck
Var /GLOBAL h00kShortcutWanted
Var /GLOBAL h00kRadioEn
Var /GLOBAL h00kRadioPl
Var /GLOBAL h00kRadioRu
Var /GLOBAL h00kRadioUk
!endif

!macro customWelcomePage
  Page custom h00kLanguagePageCreate h00kLanguagePageLeave
  !define MUI_WELCOMEPAGE_TITLE "h00k Desktop"
  !define MUI_WELCOMEPAGE_TEXT "$(h00kWelcome)"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInit
  ; English by default independent of the Windows locale.
  ; On upgrades, respect the last explicit installation language.
  StrCpy $LANGUAGE 1033
  ReadRegStr $R8 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "H00kInstallerLanguage"
  ${If} $R8 == "1045"
    StrCpy $LANGUAGE 1045
  ${ElseIf} $R8 == "1049"
    StrCpy $LANGUAGE 1049
  ${ElseIf} $R8 == "1058"
    StrCpy $LANGUAGE 1058
  ${EndIf}
  ; /H00K_LANG=en|pl|ru|uk for silent installations and Windows CI.
  ${GetParameters} $R8
  ${GetOptions} $R8 "/H00K_LANG=" $R9
  ${IfNot} ${Errors}
    ${If} $R9 == "en"
      StrCpy $LANGUAGE 1033
    ${ElseIf} $R9 == "pl"
      StrCpy $LANGUAGE 1045
    ${ElseIf} $R9 == "ru"
      StrCpy $LANGUAGE 1049
    ${ElseIf} $R9 == "uk"
      StrCpy $LANGUAGE 1058
    ${EndIf}
  ${EndIf}

  StrCpy $h00kShortcutWanted "1"
  ReadRegStr $R8 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "H00kDesktopShortcutChoice"
  ${If} $R8 == "0"
    StrCpy $h00kShortcutWanted "0"
  ${EndIf}
  ${GetParameters} $R8
  ${GetOptions} $R8 "/NO_DESKTOP_SHORTCUT" $R9
  ${IfNot} ${Errors}
    StrCpy $h00kShortcutWanted "0"
  ${EndIf}
  ${GetOptions} $R8 "/DESKTOP_SHORTCUT" $R9
  ${IfNot} ${Errors}
    StrCpy $h00kShortcutWanted "1"
  ${EndIf}
!macroend

!macro customUnInit
  ReadRegStr $R8 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "H00kInstallerLanguage"
  ${If} $R8 == "1033"
    StrCpy $LANGUAGE 1033
  ${ElseIf} $R8 == "1045"
    StrCpy $LANGUAGE 1045
  ${ElseIf} $R8 == "1049"
    StrCpy $LANGUAGE 1049
  ${ElseIf} $R8 == "1058"
    StrCpy $LANGUAGE 1058
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER

!macro customPageAfterChangeDir
  Page custom h00kShortcutPageCreate h00kShortcutPageLeave
!macroend

!macro customFinishPage
  ; Three translated post-install help pages before the native Finish page.
  Page custom h00kGuideBasicsCreate
  Page custom h00kGuideLayoutCreate
  Page custom h00kGuideApiCreate
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !insertmacro MUI_PAGE_FINISH
!macroend

Function h00kLanguagePageCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  !insertmacro h00kSetHeader "$(h00kLanguageTitle)" "$(h00kLanguageSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 3u 100% 20u "$(h00kLanguagePrompt)"
  Pop $1
  ; WS_GROUP marks one mutually exclusive group of language radio buttons.
  ${NSD_CreateRadioButton} 0 28u 100% 20u "English"
  Pop $h00kRadioEn
  ${NSD_AddStyle} $h00kRadioEn ${WS_GROUP} ; exclusive language group
  ${NSD_CreateRadioButton} 0 54u 100% 20u "Polski"
  Pop $h00kRadioPl
  ${NSD_CreateRadioButton} 0 80u 100% 20u "Русский"
  Pop $h00kRadioRu
  ${NSD_CreateRadioButton} 0 106u 100% 20u "Українська"
  Pop $h00kRadioUk
  ${If} $LANGUAGE == 1045
    ${NSD_Check} $h00kRadioPl
  ${ElseIf} $LANGUAGE == 1049
    ${NSD_Check} $h00kRadioRu
  ${ElseIf} $LANGUAGE == 1058
    ${NSD_Check} $h00kRadioUk
  ${Else}
    ${NSD_Check} $h00kRadioEn
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function h00kLanguagePageLeave
  ${NSD_GetState} $h00kRadioEn $R0
  ${If} $R0 == ${BST_CHECKED}
    StrCpy $LANGUAGE 1033
  ${EndIf}
  ${NSD_GetState} $h00kRadioPl $R0
  ${If} $R0 == ${BST_CHECKED}
    StrCpy $LANGUAGE 1045
  ${EndIf}
  ${NSD_GetState} $h00kRadioRu $R0
  ${If} $R0 == ${BST_CHECKED}
    StrCpy $LANGUAGE 1049
  ${EndIf}
  ${NSD_GetState} $h00kRadioUk $R0
  ${If} $R0 == ${BST_CHECKED}
    StrCpy $LANGUAGE 1058
  ${EndIf}
FunctionEnd

Function h00kShortcutPageCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  !insertmacro h00kSetHeader "$(h00kShortcutTitle)" "$(h00kShortcutSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 12u 100% 45u "$(h00kShortcutPrompt)"
  Pop $1
  ${NSD_CreateCheckbox} 0 83u 100% 25u "$(h00kShortcutOption)"
  Pop $h00kShortcutCheck
  ${If} $h00kShortcutWanted == "1"
    ${NSD_Check} $h00kShortcutCheck
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function h00kShortcutPageLeave
  ${NSD_GetState} $h00kShortcutCheck $h00kShortcutWanted
FunctionEnd

Function h00kGuideBasicsCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  !insertmacro h00kSetHeader "$(h00kGuideTitle)" "$(h00kGuideSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  nsDialogs::CreateControl EDIT ${DEFAULT_STYLES}|${WS_TABSTOP}|${ES_MULTILINE}|${ES_AUTOVSCROLL}|${WS_VSCROLL}|${ES_READONLY} ${WS_EX_CLIENTEDGE} 0 0 100% 100% "$(h00kGuide1)$\r$\n$\r$\n$(h00kGuide2)$\r$\n$\r$\n$(h00kGuide3)"
  Pop $R6
  nsDialogs::Show
FunctionEnd

Function h00kGuideLayoutCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  !insertmacro h00kSetHeader "$(h00kLayoutTitle)" "$(h00kLayoutSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  nsDialogs::CreateControl EDIT ${DEFAULT_STYLES}|${WS_TABSTOP}|${ES_MULTILINE}|${ES_AUTOVSCROLL}|${WS_VSCROLL}|${ES_READONLY} ${WS_EX_CLIENTEDGE} 0 0 100% 100% "$(h00kGuide4)$\r$\n$\r$\n$(h00kGuide5)$\r$\n$\r$\n$(h00kApi1)$\r$\n$\r$\n$(h00kApi2)"
  Pop $R6
  nsDialogs::Show
FunctionEnd

Function h00kGuideApiCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  !insertmacro h00kSetHeader "$(h00kApiTitle)" "$(h00kApiSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  nsDialogs::CreateControl EDIT ${DEFAULT_STYLES}|${WS_TABSTOP}|${ES_MULTILINE}|${ES_AUTOVSCROLL}|${WS_VSCROLL}|${ES_READONLY} ${WS_EX_CLIENTEDGE} 0 0 100% 100% "$(h00kApi3)$\r$\n$\r$\n$(h00kApi4)$\r$\n$\r$\n$(h00kApi5)$\r$\n$\r$\n$(h00kGuideFooter)"
  Pop $R6
  nsDialogs::Show
FunctionEnd

!endif ; BUILD_UNINSTALLER

!macro customInstall
  ${If} $h00kShortcutWanted != "1"
    Delete "$newDesktopLink"
    Delete "$oldDesktopLink"
  ${Else}
    ${IfNot} ${FileExists} "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "H00kDesktopShortcutChoice" "$h00kShortcutWanted"
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "H00kInstallerLanguage" "$LANGUAGE"
!macroend

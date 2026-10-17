@echo off
REM Zero-Admin Windows Launcher for NoctisBrowser
SETLOCAL
SET "DIR=%~dp0"
CD /D "%DIR%"

REM Prepend bundled Windows x64 Tor directory to PATH
SET "PATH=%DIR%bin\windows\x86_64;%PATH%"

IF EXIST "%DIR%node_modules\.bin\electron.cmd" (
  CALL "%DIR%node_modules\.bin\electron.cmd" . %*
) ELSE IF EXIST "%DIR%node_modules\electron\dist\electron.exe" (
  "%DIR%node_modules\electron\dist\electron.exe" . %*
) ELSE (
  npx --yes electron@41.7.1 . %*
)
ENDLOCAL

@echo off
setlocal
if exist "%~dp0..\node.exe" (
  "%~dp0..\node.exe" "%~dp0maxide.js" %*
) else (
  node "%~dp0maxide.js" %*
)
endlocal


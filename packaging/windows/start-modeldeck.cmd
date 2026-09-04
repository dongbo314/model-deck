@echo off
setlocal
cd /d "%~dp0\..\.." || exit /b 1
node bin\modeldeck.mjs start
set "MODELDECK_EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %MODELDECK_EXIT_CODE%

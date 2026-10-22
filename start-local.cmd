@echo off
setlocal
cd /d "%~dp0"
set "RENTAL_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%RENTAL_NODE%" goto run
set "RENTAL_NODE=node"
where node >nul 2>nul
if errorlevel 1 goto missing
:run
"%RENTAL_NODE%" scripts\start-local.mjs
if errorlevel 1 goto failed
exit /b 0
:missing
echo Node.js was not found. Install Node.js or open this project in Codex.
:failed
echo The application server could not start. Keep this message for troubleshooting.
pause
exit /b 1

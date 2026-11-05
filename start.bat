@echo off
rem Starts the overlay: installs on the first run, builds, opens the control
rem panel, and keeps the server running until this window is closed.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 22 ? 1 : 0)"
if errorlevel 1 (
  echo Node.js 22 or newer is needed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

rem The game's PDFs go here (see SETUP.md).
if not exist artifacts\ mkdir artifacts

if not exist node_modules\ (
  echo Installing, first run only. This takes a minute or two...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto failed
)

echo Building...
call npm run build --silent
if errorlevel 1 goto failed

if "%PORT%"=="" set PORT=7777
echo.
echo Control panel: http://localhost:%PORT%/control
echo Overlay for OBS: http://localhost:%PORT%/overlay
echo Close this window to stop.
echo.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:%PORT%/control"
call npm start
pause
exit /b 0

:failed
echo.
echo Something went wrong; see the messages above.
pause
exit /b 1

@echo off
rem Double-click to make the small zip to share: everything except the game's
rem PDFs (the receiver adds their own copies; see SETUP.md).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-zip.ps1" -Mini %*
pause

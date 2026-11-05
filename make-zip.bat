@echo off
rem Double-click to make the zip to share (see make-zip.ps1 for what goes in).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-zip.ps1" %*
pause

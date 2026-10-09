@echo off
title Sample Library - Studio Manager
echo Starting local Studio Manager...
echo.
echo Close this window at any time to stop the server.
echo.

:: open browser after a brief delay so server has time to bind
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5173/#/manage"

:: run local vite dev server
cd /d "%~dp0"
npm.cmd run dev


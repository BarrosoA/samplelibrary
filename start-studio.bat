@echo off
title Sample Library - Studio Manager
cd /d "%~dp0"

:: already running (e.g. opened again from the STUDIO button): just show it
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if %errorlevel%==0 (
  start "" http://localhost:5173/#/manage
  exit /b
)

echo Starting local Studio Manager...
echo.
echo Close this window at any time to stop the server.
echo.

:: open browser after a brief delay so server has time to bind
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5173/#/manage"

:: run local vite dev server
npm.cmd run dev

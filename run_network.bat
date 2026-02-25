@echo off
setlocal enabledelayedexpansion
title Hex Map Generator - Network Mode
cd /d "%~dp0"

echo ============================================
echo   Hex Map Generator - Network Launcher
echo ============================================
echo.

REM --- Ensure venv exists (run.bat creates it) ---
if not exist ".venv\Scripts\python.exe" (
    echo [INFO] First-time setup - running main launcher...
    call run.bat
    exit /b
)

set "VENV_PYTHON=.venv\Scripts\python.exe"

echo Your local IP addresses are:
ipconfig | findstr /i "IPv4"
echo.
echo Starting web server on port 8000...
echo You can access this from another computer at http://[YOUR_IP]:8000
echo Press Ctrl+C to stop.
echo.
"%VENV_PYTHON%" server.py

echo.
echo Server stopped.
pause

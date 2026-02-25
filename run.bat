@echo off
setlocal enabledelayedexpansion
title Hex Map Generator
cd /d "%~dp0"

echo ============================================
echo        Hex Map Generator - Launcher
echo ============================================
echo.

REM --- Find Python ---
set "PYTHON="
where python >nul 2>&1 && set "PYTHON=python"
if not defined PYTHON (
    where python3 >nul 2>&1 && set "PYTHON=python3"
)
if not defined PYTHON (
    where py >nul 2>&1 && set "PYTHON=py"
)

if not defined PYTHON (
    echo [ERROR] Python was not found on your system.
    echo.
    echo Please install Python 3.8 or newer from:
    echo   https://www.python.org/downloads/
    echo.
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo [OK] Found Python: %PYTHON%
%PYTHON% --version
echo.

REM --- Create venv if it doesn't exist ---
if not exist ".venv\Scripts\python.exe" (
    echo [SETUP] Creating virtual environment...
    %PYTHON% -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created.
    echo.
)

REM --- Activate venv ---
set "VENV_PYTHON=.venv\Scripts\python.exe"
set "VENV_PIP=.venv\Scripts\pip.exe"

REM --- Install / update dependencies ---
REM   Uses a stamp file to skip pip when requirements.txt hasn't changed.
set "STAMP=.venv\.requirements_stamp"
set "NEEDS_INSTALL=0"

if not exist "%STAMP%" set "NEEDS_INSTALL=1"
if "%NEEDS_INSTALL%"=="0" (
    fc /b requirements.txt "%STAMP%" >nul 2>&1
    if errorlevel 1 set "NEEDS_INSTALL=1"
)

if "%NEEDS_INSTALL%"=="1" (
    echo [SETUP] Installing dependencies...
    "%VENV_PIP%" install -r requirements.txt --quiet
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies. Check the output above.
        pause
        exit /b 1
    )
    copy /y requirements.txt "%STAMP%" >nul
    echo [OK] Dependencies installed.
    echo.
)

echo [OK] Ready to launch!
echo.

REM --- Open browser after a short delay ---
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"

REM --- Start server ---
echo Starting server at http://localhost:8000 ...
echo Press Ctrl+C to stop.
echo.
"%VENV_PYTHON%" server.py

echo.
echo Server stopped.
pause
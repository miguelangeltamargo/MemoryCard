@echo off
REM Schedule Game Save Sync to run automatically on Windows using Task Scheduler
REM Run this script as Administrator

echo ========================================
echo Game Save Sync - Windows Scheduler
echo ========================================
echo.

REM Get the current directory
set SCRIPT_DIR=%~dp0
set PYTHON_SCRIPT=%SCRIPT_DIR%game_save_sync.py

REM Find Python executable
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_PATH=python
) else (
    where python3 >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set PYTHON_PATH=python3
    ) else (
        echo Error: Python not found in PATH
        echo Please install Python and make sure it's added to PATH
        pause
        exit /b 1
    )
)

echo Found Python: %PYTHON_PATH%
echo Script location: %PYTHON_SCRIPT%
echo.

REM Create the scheduled task
echo Creating scheduled task...
echo.

schtasks /create /tn "Game Save Sync" /tr "%PYTHON_PATH% \"%PYTHON_SCRIPT%\"" /sc onlogon /rl highest /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Success! Game Save Sync is now scheduled
    echo ========================================
    echo.
    echo The service will:
    echo   - Start automatically when you log in
    echo   - Run in the background
    echo   - Sync your saves every 5 minutes
    echo.
    echo To manage the task:
    echo   - Open Task Scheduler
    echo   - Look for "Game Save Sync"
    echo.
    echo To stop the service:
    echo   schtasks /end /tn "Game Save Sync"
    echo.
    echo To delete the scheduled task:
    echo   schtasks /delete /tn "Game Save Sync" /f
    echo.
    echo To start it manually now:
    echo   schtasks /run /tn "Game Save Sync"
    echo.
) else (
    echo.
    echo ========================================
    echo Error creating scheduled task
    echo ========================================
    echo.
    echo Please make sure you're running this script as Administrator
    echo Right-click on the script and select "Run as administrator"
    echo.
)

pause

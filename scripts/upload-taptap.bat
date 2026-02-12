@echo off
cd /d "%~dp0.."

echo.
echo ========== TapTap Build and Upload ==========
echo.

node "%~dp0upload-taptap.js"

if errorlevel 1 (
    echo.
    echo Failed. Check error above.
    pause
    exit /b 1
)

echo.
pause
exit /b 0

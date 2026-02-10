@echo off
setlocal

cd /d "%~dp0"

echo.
echo ==> Start Android packaging...
powershell -ExecutionPolicy Bypass -File ".\scripts\package-android.ps1"
set "exitCode=%ERRORLEVEL%"

if not "%exitCode%"=="0" (
    echo.
    echo Packaging failed. Exit code: %exitCode%
    exit /b %exitCode%
)

echo.
echo Packaging completed.
echo APK: android\app\build\outputs\apk\debug\app-debug.apk
exit /b 0

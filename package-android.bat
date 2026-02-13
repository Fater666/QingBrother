@echo off
setlocal

cd /d "%~dp0"

REM 可选: release 或 dev（默认 dev）
set "BUILD=dev"
if /I "%1"=="release" set "BUILD=release"
if /I "%1"=="dev"     set "BUILD=dev"

if "%BUILD%"=="release" (
    set "APK_PATH=%~dp0android\app\build\outputs\apk\release\app-release.apk"
) else (
    set "APK_PATH=%~dp0android\app\build\outputs\apk\debug\app-debug.apk"
)

echo.
echo ==> Start Android packaging [%BUILD%]...
powershell -ExecutionPolicy Bypass -File ".\scripts\package-android.ps1" -BuildType %BUILD%
set "exitCode=%ERRORLEVEL%"

if not "%exitCode%"=="0" (
    echo.
    echo Packaging failed. Exit code: %exitCode%
    exit /b %exitCode%
)

echo.
echo Packaging completed.
echo APK: %APK_PATH%

if not exist "%APK_PATH%" (
    echo.
    echo APK file not found, skip install.
    exit /b 1
)

where adb >nul 2>nul
if errorlevel 1 (
    echo.
    echo adb not found in PATH, skip auto install.
    echo You can install manually with: adb install -r "%APK_PATH%"
    exit /b 0
)

echo.
echo ==> Try auto install to emulator...
adb start-server >nul 2>nul

if "%MUMU_SERIAL%"=="" set "MUMU_SERIAL=127.0.0.1:7555"
adb connect %MUMU_SERIAL% >nul 2>nul

set "TARGET_DEVICE="
for /f "tokens=1,2" %%a in ('adb devices ^| findstr /R "device$"') do (
    if /I not "%%a"=="List" (
        set "TARGET_DEVICE=%%a"
    )
)

if "%TARGET_DEVICE%"=="" (
    echo No online emulator/device found.
    echo Please start MuMu first, then run:
    echo adb connect %MUMU_SERIAL%
    echo adb install -r "%APK_PATH%"
    exit /b 1
)

echo Installing to: %TARGET_DEVICE%
adb -s %TARGET_DEVICE% install -r "%APK_PATH%"
if errorlevel 1 (
    echo Install failed.
    exit /b 1
)

echo Install completed.
exit /b 0

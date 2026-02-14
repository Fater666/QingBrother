@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

REM build type: release or dev (default dev)
set "BUILD=dev"
if /I "%1"=="release" set "BUILD=release"
if /I "%1"=="dev"     set "BUILD=dev"

if "%BUILD%"=="release" (
    set "APK_DIR=%~dp0android\app\build\outputs\apk\release"
) else (
    set "APK_PATH=%~dp0android\app\build\outputs\apk\debug\app-debug.apk"
)

echo.
echo ==> Start Android packaging [%BUILD%]...
powershell -ExecutionPolicy Bypass -File ".\scripts\package-android.ps1" -BuildType %BUILD%
set "exitCode=%ERRORLEVEL%"

if "%BUILD%"=="release" (
    for %%f in ("%APK_DIR%\qingbrother-*.apk") do set "APK_PATH=%%f"
)
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
echo ==> Auto install to all connected devices...
adb start-server >nul 2>nul

if "%MUMU_SERIAL%"=="" set "MUMU_SERIAL=127.0.0.1:7555"
adb connect %MUMU_SERIAL% >nul 2>nul

set "DEVICE_COUNT=0"
set "FAIL_COUNT=0"
REM Install to all connected devices (any state: device, offline, etc.)
for /f "tokens=1,2" %%a in ('adb devices') do (
    if /I not "%%a"=="List" if not "%%b"=="" (
        set /a DEVICE_COUNT+=1
        echo.
        echo [%%a] state=%%b
        if /I not "%%b"=="device" (
            echo Waiting for device to come online...
            adb -s %%a wait-for-device
        )
        echo Installing...
        adb -s %%a install -r -d -t "%APK_PATH%"
        if errorlevel 1 (
            set /a FAIL_COUNT+=1
            echo [%%a] Install failed.
            echo   If signature mismatch, try: adb -s %%a uninstall com.qingbrother.app
        ) else (
            echo [%%a] Install completed.
        )
    )
)

if "!DEVICE_COUNT!"=="0" (
    echo.
    echo No emulator/device found.
    echo Please start emulator(s^) first, then run:
    echo adb connect %MUMU_SERIAL%
    echo adb install -r "%APK_PATH%"
    exit /b 1
)

echo.
if "!FAIL_COUNT!"=="0" goto install_ok
goto install_some_failed

:install_ok
call echo All %%DEVICE_COUNT%% device(s^) installed successfully.
exit /b 0

:install_some_failed
call echo %%FAIL_COUNT%% of %%DEVICE_COUNT%% device(s^) failed.
echo Possible: signature mismatch ^(INSTALL_FAILED_UPDATE_INCOMPATIBLE^), uninstall then reinstall.
exit /b 1

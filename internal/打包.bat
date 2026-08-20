@echo off
setlocal
cd /d "%~dp0"

echo IronNestFCT internal mod - local release packaging
echo Game directory is auto-detected; pass a path to override:
echo   打包.bat "D:\SteamLibrary\steamapps\common\Iron Nest Heavy Turret Simulator"
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Build-ReleasePackages.ps1" %*

if errorlevel 1 (
    echo.
    echo Packaging failed. See the error above.
    pause
    exit /b 1
)

echo.
echo Packaging completed.
pause
exit /b 0

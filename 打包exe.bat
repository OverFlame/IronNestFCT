@echo off
setlocal
cd /d "%~dp0"

echo IronNestFCT external terminal - portable EXE packaging
echo.

where cargo >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Rust (cargo) not found in PATH.
    echo.
    echo Install prerequisites first:
    echo   1. Rust:  https://rustup.rs  (choose the MSVC toolchain)
    echo   2. Visual Studio Build Tools with "Desktop development with C++" workload
    echo   3. Node.js: https://nodejs.org
    echo.
    echo Then reopen this command prompt and run again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js (npm) not found in PATH. Install from https://nodejs.org
    pause
    exit /b 1
)

echo Building portable EXE...
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install || goto :fail
)

call npm run build || goto :fail

if not exist "artifacts" mkdir artifacts
copy /y "src-tauri\target\release\ironnestfct.exe" "artifacts\IronNestFCT.exe" || goto :fail

echo.
echo Portable EXE ready: artifacts\IronNestFCT.exe
echo Deploy: copy the single EXE anywhere; it runs without installation.
echo Note: target machines need the WebView2 runtime (preinstalled on Windows 10/11).
goto :eof

:fail
echo.
echo Packaging failed. See the error above.
pause
exit /b 1

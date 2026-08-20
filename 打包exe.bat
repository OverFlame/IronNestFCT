@echo off
setlocal
cd /d "%~dp0"

echo IronNestFCT external terminal - portable EXE packaging
echo Requires: Rust + VS Build Tools (C++ workload) + Node.js
echo Target machines need the WebView2 runtime (preinstalled on Windows 10/11).
echo.

if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install || goto :fail
)

echo Building portable EXE...
call npm run build || goto :fail

if not exist "artifacts" mkdir artifacts
copy /y "src-tauri\target\release\ironnestfct.exe" "artifacts\IronNestFCT.exe" || goto :fail

echo.
echo Portable EXE ready: artifacts\IronNestFCT.exe
echo Deploy: copy the single EXE anywhere; it runs without installation.
goto :eof

:fail
echo.
echo Packaging failed. See the error above.
pause
exit /b 1

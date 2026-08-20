@echo off
setlocal
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=dev"

if /I "%MODE%"=="help" goto help
if /I "%MODE%"=="stop" goto stop
if /I "%MODE%"=="dev" goto main
if /I "%MODE%"=="release" goto main
if /I "%MODE%"=="build" goto main
echo Unknown mode: %MODE%
goto help

:help
echo Usage: start-kittypet.cmd [dev^|release^|stop]
echo.
echo   (no args)  dev      Stop old KittyPet, then run the latest dev build.
echo   release             Stop old KittyPet, build a fresh release, then run it.
echo   build               Same as release.
echo   stop                Stop all KittyPet processes only.
echo.
echo Tip: use "dev" while testing changes, "release" for daily use.
exit /b 0

:stop
echo Stopping KittyPet processes...
taskkill /IM kittypet.exe /F /T >nul 2>&1
if not errorlevel 128 (
  timeout /t 1 /nobreak >nul
)
echo Done.
exit /b 0

:main
echo ============================================
echo   KittyPet launcher  ^(mode: %MODE%^)
echo ============================================

echo [1/4] Stopping any existing KittyPet (old installed build included)...
call :stop

rem Prefer the bundled Node runtime when present (portable toolchain layout),
rem otherwise fall back to Node in PATH.
set "LOCAL_NODE=%~dp0..\.tools\node-v24.19.0-win-x64"
if exist "%LOCAL_NODE%\node.exe" set "PATH=%LOCAL_NODE%;%PATH%"

rem Cargo is normally under the user profile; make sure it is reachable.
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 20+ or put node on PATH.
  pause
  exit /b 1
)

where cargo >nul 2>&1
if errorlevel 1 (
  echo [ERROR] cargo not found. Install Rust or put %%USERPROFILE%%\.cargo\bin on PATH.
  pause
  exit /b 1
)

echo [2/4] Checking npm dependencies...
if not exist "node_modules" (
  echo         Installing dependencies, first run only...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if /I "%MODE%"=="dev" (
  echo [3/4] Starting development build...
  echo [4/4] Close this window or run start-kittypet.cmd stop to quit.
  echo.
  call npm run tauri dev
  exit /b %errorlevel%
)

echo [3/4] Building release (this can take a few minutes)...
call npm run tauri build
if errorlevel 1 (
  echo [ERROR] tauri build failed.
  pause
  exit /b 1
)

echo [4/4] Starting fresh release build...
start "" "%~dp0src-tauri\target\release\kittypet.exe"
endlocal
exit /b 0

@echo off
chcp 65001 >nul
setlocal

set "APP_NAME=kittypet.exe"

rem ===== 1. 检查是否已经在运行，避免重复启动 =====
tasklist /FI "IMAGENAME eq %APP_NAME%" 2>nul | find /I "%APP_NAME%" >nul
if not errorlevel 1 (
    echo KittyPet 桌宠已经在运行啦，不用重复启动 ^(^-^)^
    timeout /t 3 >nul
    exit /b 0
)

rem ===== 2. 依次查找可执行文件：已安装版 → 项目 release 构建 =====
set "EXE="
if exist "%LOCALAPPDATA%\KittyPet\kittypet.exe" set "EXE=%LOCALAPPDATA%\KittyPet\kittypet.exe"
if not defined EXE if exist "%LOCALAPPDATA%\Programs\KittyPet\kittypet.exe" set "EXE=%LOCALAPPDATA%\Programs\KittyPet\kittypet.exe"
if not defined EXE if exist "%~dp0src-tauri\target\release\kittypet.exe" set "EXE=%~dp0src-tauri\target\release\kittypet.exe"

if not defined EXE (
    echo [错误] 没有找到 kittypet.exe。
    echo 请先安装 KittyPet，或在项目目录执行：
    echo     npm install
    echo     npm run tauri build
    pause
    exit /b 1
)

rem ===== 3. 启动桌宠 =====
echo 正在启动 KittyPet 桌宠...
start "" "%EXE%"
exit /b 0

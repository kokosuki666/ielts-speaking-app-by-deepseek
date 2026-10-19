@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  IELTS Speaking Studio 启动诊断
echo ============================================
echo 目录: %CD%
if exist "IELTS Speaking Studio.exe" (echo exe: OK) else (echo exe: 缺失)
if exist "resources\app\server\index.mjs" (echo resources: OK) else (echo resources: 缺失)
if exist "resources\app\electron\main.cjs" (echo electron: OK) else (echo electron: 缺失)
echo.
echo 正在以 smoke 模式启动（不显示窗口，最多 60 秒）...
set ELECTRON_ENABLE_LOGGING=1
"IELTS Speaking Studio.exe" --smoke
echo.
echo 退出码: %ERRORLEVEL%
echo.
echo --- startup.log ---
if exist "%APPDATA%\ielts-speaking-webapp\startup.log" (
  type "%APPDATA%\ielts-speaking-webapp\startup.log"
) else (
  echo 没有找到 startup.log
)
echo.
pause

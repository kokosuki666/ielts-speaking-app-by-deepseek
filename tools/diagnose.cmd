@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_ENABLE_LOGGING=1"
echo ============================================
echo  IELTS Speaking Studio diagnostics
echo ============================================
echo Folder: %CD%
if exist "IELTS Speaking Studio.exe" (echo exe: OK) else (echo exe: MISSING)
if exist "resources\app\server\index.mjs" (echo resources: OK) else (echo resources: MISSING - extract the whole zip)
if exist "resources\app\electron\main.cjs" (echo electron: OK) else (echo electron: MISSING)
echo.
if not exist "IELTS Speaking Studio.exe" goto end
if not exist "resources\app\server\index.mjs" goto end
echo Running smoke test (no window, up to 60s)...
"IELTS Speaking Studio.exe" --smoke
echo Exit code: %ERRORLEVEL%
echo.
echo --- startup.log ---
if exist "%APPDATA%\ielts-speaking-webapp\startup.log" (type "%APPDATA%\ielts-speaking-webapp\startup.log") else (echo no startup.log)
:end
echo.
pause
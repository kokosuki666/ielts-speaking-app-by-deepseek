@echo off
setlocal
cd /d "%~dp0"
rem Never let a stray ELECTRON_RUN_AS_NODE turn the app into Node (no window).
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_ENABLE_LOGGING=1"

if not exist "IELTS Speaking Studio.exe" goto no_exe
if not exist "resources\app\server\index.mjs" goto not_extracted

echo Starting IELTS Speaking Studio...
echo (This window stays open while the app runs; close the app or press Ctrl+C.)
"IELTS Speaking Studio.exe"
echo.
echo Exit code: %ERRORLEVEL%
echo.
if exist "%APPDATA%\ielts-speaking-webapp\startup.log" (
  echo --- startup.log ---
  type "%APPDATA%\ielts-speaking-webapp\startup.log"
) else (
  echo No startup.log was written. The app did not reach its main process.
)
echo.
pause
goto :eof

:no_exe
echo ERROR: "IELTS Speaking Studio.exe" was not found in this folder.
echo Put start.cmd NEXT TO the exe.
pause
goto :eof

:not_extracted
echo ERROR: resources folder is missing.
echo You are probably running from inside the ZIP. Extract the whole archive first:
echo   right-click the zip - Extract All - then open the extracted folder.
pause
goto :eof
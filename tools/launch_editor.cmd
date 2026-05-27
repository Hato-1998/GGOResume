@echo off
REM GGOResume HTML Editor launcher (ASCII-only to avoid cmd encoding issues).

chcp 65001 >nul
set PYTHONIOENCODING=utf-8
title GGOResume HTML Editor

cd /d "%~dp0.."

echo Starting GGOResume editor server...
echo Browser will open at http://127.0.0.1:7701/
echo Press Ctrl+C in this window to stop.
echo.

python tools\editor\server.py
set EXITCODE=%ERRORLEVEL%

echo.
echo ============================================
if "%EXITCODE%"=="0" (
    echo  Server stopped. Press any key to close.
) else (
    echo  Exit code %EXITCODE%. Check messages above.
)
echo ============================================
pause >nul

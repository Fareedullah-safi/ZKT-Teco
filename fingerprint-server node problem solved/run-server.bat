@echo off
setlocal
cd /d "%~dp0"
title ZK9500 Bridge Launcher

echo ==========================================
echo   ZK9500 Fingerprint Bridge
echo ==========================================

where javac >nul 2>nul
if errorlevel 1 goto nojavac

if not exist "FingerprintBridge.java" goto nosource
if not exist "lib\ZKFingerReader.jar" goto nojar

echo.
echo Using this Java compiler:
javac -version
echo.

echo [1/2] Compiling FingerprintBridge.java ...
del /q FingerprintBridge*.class >nul 2>nul
javac -encoding UTF-8 -cp ".;lib\ZKFingerReader.jar" FingerprintBridge.java
if errorlevel 1 goto compilefail

echo [2/2] Starting bridge on port 8765 ...
start "Java Bridge (8765)" cmd /k "java -cp ".;lib\ZKFingerReader.jar" FingerprintBridge"

timeout /t 3 /nobreak >nul

if exist "cloudflared.exe" (
    echo Starting Cloudflare tunnel ...
    cloudflared.exe tunnel --url http://127.0.0.1:8765
) else (
    echo [INFO] cloudflared.exe not found. Running locally only.
    pause
)
goto end

:nojavac
echo [ERROR] javac was not found. Install a JDK or add its bin folder to PATH.
pause
goto end

:nosource
echo [ERROR] FingerprintBridge.java is not in this folder.
pause
goto end

:nojar
echo [ERROR] lib\ZKFingerReader.jar was not found.
pause
goto end

:compilefail
echo.
echo [ERROR] Compile failed. Fix the error above. Not starting.
pause
goto end

:end
endlocal
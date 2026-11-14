@echo off
title ZK9500 Fingerprint Server + HTTPS Tunnel
cd /d "%~dp0"

echo [0/2] Compiling FingerprintBridge.java...
javac -encoding UTF-8 -cp ".;lib\ZKFingerReader.jar" FingerprintBridge.java
if errorlevel 1 (
    echo.
    echo [ERROR] Compile failed. Fix the error above. Not starting.
    pause
    exit /b 1
)

:: Optional password shared with Next.js. Remove the "::" to turn it on,
:: and put the SAME value as BRIDGE_TOKEN in .env.local (and in Vercel).
:: set BRIDGE_TOKEN=put-a-long-random-string-here

echo [1/2] Launching Java Bridge Server on port 8765...
start "Java Bridge (8765)" cmd /k "java -cp ".;lib\ZKFingerReader.jar" FingerprintBridge"

timeout /t 2 /nobreak >nul

echo [2/2] Creating HTTPS tunnel...
echo ========================================================
echo COPY THE 'https://...trycloudflare.com' LINK BELOW
echo ========================================================
if exist "cloudflared.exe" (
    cloudflared.exe tunnel --url http://127.0.0.1:8765
) else (
    echo [ERROR] cloudflared.exe was not found in this folder!
    pause
)
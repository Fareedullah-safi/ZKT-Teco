@echo off
title ZK9500 Fingerprint Server + HTTPS Tunnel
cd /d "%~dp0"

echo ========================================================
echo Starting ZK9500 Java Bridge and HTTPS Tunnel...
echo ========================================================
echo.

:: 1. Start Java Bridge Server in background window
echo [1/2] Launching Java Bridge Server on port 8765...
start "Java Bridge (8765)" cmd /k "java -cp ".;lib\ZKFingerReader.jar" FingerprintBridge"

:: 2. Wait 2 seconds
timeout /t 2 /nobreak >nul

:: 3. Start Cloudflare HTTPS Tunnel
echo [2/2] Creating Secure HTTPS Tunnel for Vercel...
echo ========================================================
echo COPY THE 'https://...trycloudflare.com' LINK BELOW
echo AND PASTE IT INTO YOUR VERCEL WEBSITE!
echo ========================================================
echo.

if exist "cloudflared.exe" (
    cloudflared.exe tunnel --url http://127.0.0.1:8765
) else (
    echo [ERROR] cloudflared.exe was not found in this folder!
    echo Please make sure cloudflared.exe is inside this directory.
    pause
)
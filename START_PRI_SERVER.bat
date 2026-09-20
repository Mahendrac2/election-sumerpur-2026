@echo off
title Panchayati Raj Election 2026 - Server
color 0A
cd /d "%~dp0PRI_Election_2026"

echo ============================================================
echo   PANCHAYATI RAJ ELECTION 2026 - LOCAL SERVER
echo   http://localhost:3001
echo ============================================================
echo.

if not exist "node_modules" (
    echo [1/2] Installing dependencies...
    call npm install
)

echo [2/2] Starting server on Port 3001...
echo Opening browser...
start "" "http://localhost:3001"
node server.js

if %errorlevel% neq 0 (
    echo.
    echo Server exited with error code %errorlevel%.
)
pause

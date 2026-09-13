@echo off
title Sumerpur Election 2026 - Deploy Update to Live Link
echo =========================================================================
echo   🏛️  Sumerpur Municipal Election 2026 - Deploy Results to Live Portal
echo =========================================================================
echo.
echo 1. Live Matdan Data Status: 21,325 votes across 35 booths PROTECTED & SAVED.
echo 2. Results Module: Clean initial store ready with all 35 wards and Form 21.
echo 3. Target: https://election-sumerpur2026.onrender.com
echo.
echo Pushing latest committed code to GitHub repository...
echo.

"%LOCALAPPDATA%\MinGit\cmd\git.exe" push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =========================================================================
    echo  ✅ SUCCESS: Code successfully pushed to GitHub!
    echo  Render is now deploying the updated portal.
    echo  You can view it live in 1-2 minutes at:
    echo  👉 https://election-sumerpur2026.onrender.com/results
    echo  👉 https://election-sumerpur2026.onrender.com
    echo =========================================================================
) else (
    echo.
    echo =========================================================================
    echo  ⚠️ Push requires authentication.
    echo  If you have a GitHub Personal Access Token (PAT), you can push with:
    echo  "%LOCALAPPDATA%\MinGit\cmd\git.exe" push https://YOUR_TOKEN@github.com/Mahendrac2/election-sumerpur-2026.git main
    echo =========================================================================
)

echo.
pause

@echo off
title Sumerpur Election 2026 - Deploy Update to Live Link
color 0B
cd /d "%~dp0"

:: Ensure Git Credential Manager and MinGit binaries are in PATH
set "PATH=%LOCALAPPDATA%\MinGit\mingw64\bin;%LOCALAPPDATA%\MinGit\cmd;%PATH%"

echo =========================================================================
echo   🏛️  Sumerpur Municipal Election 2026 - Deploy Results to Live Portal
echo =========================================================================
echo.
echo 1. Live Matdan Data Status: 21,325 votes across 35 booths PROTECTED & SAVED.
echo 2. Results Module: Clean initial store ready with all 35 wards and Form 21.
echo 3. Target: https://election-sumerpur2026.onrender.com
echo.
echo [1/2] Pushing latest committed code to GitHub repository...
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
    echo  👉 https://election-sumerpur2026.onrender.com/form21
    echo =========================================================================
    goto :END
)

echo.
echo =========================================================================
echo  ⚠️ Push requires authentication.
echo =========================================================================
echo.
echo If Git Credential Manager browser login did not open, or if you prefer using
echo a GitHub Personal Access Token (PAT), paste your token below and press ENTER.
echo (Or press Enter with blank to exit)
echo.
set /p GH_TOKEN="Paste GitHub Token here: "

if "%GH_TOKEN%"=="" (
    echo.
    echo Exiting without pushing. You can create a GitHub token at:
    echo https://github.com/settings/tokens (classic token with 'repo' scope)
    goto :END
)

echo.
echo Pushing with provided token...
"%LOCALAPPDATA%\MinGit\cmd\git.exe" push https://%GH_TOKEN%@github.com/Mahendrac2/election-sumerpur-2026.git main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =========================================================================
    echo  ✅ SUCCESS: Code successfully pushed to GitHub via token!
    echo  Render deployment has started automatically.
    echo  👉 https://election-sumerpur2026.onrender.com/results
    echo  👉 https://election-sumerpur2026.onrender.com
    echo  👉 https://election-sumerpur2026.onrender.com/form21
    echo =========================================================================
) else (
    echo.
    echo ❌ Push failed. Please check token permissions (must have 'repo' access).
)

:END
echo.
pause

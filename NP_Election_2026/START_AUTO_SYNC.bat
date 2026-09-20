@echo off
title 🏛️ Sumerpur Election 2026 - Render 2-Way Auto Sync
color 0B
cd /d "%~dp0"
echo ========================================================================
echo  🏛️ सुमेरपुर चुनाव 2026 — Render क्लाउड एवं लोकल 2-Way ऑटो-सिंक
echo ========================================================================
echo.
echo [1/1] ऑटो-सिंक इंजन शुरू हो रहा है...
node sync-render.js
pause

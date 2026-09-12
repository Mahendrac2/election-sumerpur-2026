@echo off
title 🏛️ Sumerpur Municipal Election 2026 - Server & Remote Tunnel
color 0A
cd /d "%~dp0"
echo ========================================================================
echo  🏛️ सुमेरपुर चुनाव 2026 — सर्वर एवं रिमोट टनल लॉन्चर
echo ========================================================================
echo.
echo [1/2] Node.js चेक किया जा रहा है...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [त्रुटि] Node.js नहीं मिला! कृपया Node.js इंस्टॉल करें।
    pause
    exit /b
)

echo [2/2] सर्वर एवं सुरक्षित क्लाउड टनल प्रारंभ हो रहे हैं...
node runner.js
pause

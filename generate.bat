@echo off
title Portfolio Generator
echo ============================================
echo   Portfolio Generator
echo   Scans your folders and rebuilds projects.js and downloads data
echo ============================================
echo.
cd /d "%~dp0"
node generate.js
node generate-vrchat.js
node -e "const fs=require('fs'); const {buildDownloads}=require('./server'); fs.writeFileSync('downloads.json', JSON.stringify(buildDownloads(), null, 2));"
echo.
echo Done. Press any key to close...
pause >nul

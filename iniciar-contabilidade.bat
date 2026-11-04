@echo off
cd /d "%~dp0"
start "Contabilidade Server" cmd /k node --experimental-sqlite server.js
timeout /t 2 /nobreak >nul
start "" http://localhost:3000

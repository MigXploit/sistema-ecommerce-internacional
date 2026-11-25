@echo off
chcp 65001 >nul
title Backend Prototipo Autonomo - Comercio Electronico Internacional
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-backend-demo.ps1"
pause

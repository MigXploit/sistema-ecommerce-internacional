@echo off
chcp 65001 >nul
title Backend - Comercio Electronico Internacional (PostgreSQL 18)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-backend-postgres.ps1"
pause

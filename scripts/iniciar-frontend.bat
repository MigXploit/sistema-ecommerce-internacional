@echo off
chcp 65001 >nul
title Frontend React/TypeScript - Comercio Electronico Internacional
cd /d "%~dp0..\frontend"
if not exist "node_modules" (
    call npm.cmd install
)
call npm.cmd run dev
pause

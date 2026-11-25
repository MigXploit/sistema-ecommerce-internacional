# =============================================================================
# Iniciar Portal Tienda + Panel Operativo + Consola Seguridad (React / TypeScript)
# =============================================================================
$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location (Join-Path $rootDir "frontend")

if (-not (Test-Path "node_modules")) {
    Write-Host "==> Instalando dependencias de React/TypeScript..." -ForegroundColor Cyan
    & npm.cmd install
}

Write-Host "`n==> Iniciando interfaz web en http://localhost:5173 ..." -ForegroundColor Green
& npm.cmd run dev

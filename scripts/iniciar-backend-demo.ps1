# =============================================================================
# Iniciar Backend Spring Boot en Modo Autónomo de Prototipo
# =============================================================================
$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$jarPath = Join-Path $rootDir "backend\target\ecommerce-internacional.jar"
if (-not (Test-Path $jarPath)) {
    Push-Location (Join-Path $rootDir "backend")
    & .\mvnw.cmd -DskipTests package
    Pop-Location
}

Write-Host "`n==> Iniciando ecommerce-internacional.jar (Perfil Prototipo Autónomo) en http://localhost:8080 ..." -ForegroundColor Cyan
Set-Location (Join-Path $rootDir "backend")
& java -jar target\ecommerce-internacional.jar --spring.profiles.active=demo

# =============================================================================
# Iniciar Backend Spring Boot conectado a PostgreSQL 18 (db_ecommerce_internacional)
# =============================================================================
param(
    [string]$DbPassword = $env:DB_PASSWORD,
    [string]$DbUser = "postgres",
    [int]$DbPort = 5432
)

$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    $sec = Read-Host "Ingrese la contraseña de PostgreSQL para '$DbUser' (presione Enter si es 'postgres')" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $ingresada = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    $DbPassword = if ([string]::IsNullOrWhiteSpace($ingresada)) { "postgres" } else { $ingresada }
}

& (Join-Path $rootDir "database\setup_postgres.ps1") -DbUser $DbUser -DbPassword $DbPassword -Port $DbPort

$env:DB_USER = $DbUser
$env:DB_PASSWORD = $DbPassword
$env:DB_PORT = "$DbPort"

$jarPath = Join-Path $rootDir "backend\target\ecommerce-internacional.jar"
if (-not (Test-Path $jarPath)) {
    Push-Location (Join-Path $rootDir "backend")
    & .\mvnw.cmd -DskipTests package
    Pop-Location
}

Write-Host "`n==> Iniciando ecommerce-internacional.jar en http://localhost:8080 (PostgreSQL 18)..." -ForegroundColor Green
Set-Location (Join-Path $rootDir "backend")
& java -jar target\ecommerce-internacional.jar

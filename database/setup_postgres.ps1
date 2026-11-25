# =============================================================================
# Script de Inicialización de Base de Datos PostgreSQL 18
# Sistema de Comercio Electrónico Internacional (INF-241 - Grupo 12)
# Base de datos: db_ecommerce_internacional (UTF-8)
# =============================================================================
param(
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$DbUser = "postgres",
    [string]$DbPassword = $env:PGPASSWORD,
    [string]$DbName = "db_ecommerce_internacional",
    [string]$PsqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PsqlPath)) {
    $found = Get-Command psql -ErrorAction SilentlyContinue
    if ($found) {
        $PsqlPath = $found.Source
    } else {
        throw "No se encontró psql.exe en '$PsqlPath' ni en el PATH."
    }
}

if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    $sec = Read-Host "Ingrese la contraseña del usuario PostgreSQL '$DbUser'" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $DbPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

$env:PGPASSWORD = $DbPassword
$env:PGCLIENTENCODING = "UTF8"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==> Verificando existencia de base de datos '$DbName'..." -ForegroundColor Cyan
$exists = & $PsqlPath -h $HostName -p $Port -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DbName';"

if ($exists -notmatch "1") {
    Write-Host "==> Creando base de datos '$DbName' con codificación UTF-8..." -ForegroundColor Green
    & $PsqlPath -h $HostName -p $Port -U $DbUser -d postgres -c "CREATE DATABASE $DbName WITH ENCODING 'UTF8' TEMPLATE template0;"
} else {
    Write-Host "==> La base de datos '$DbName' ya existe. Aplicando esquema actualizado..." -ForegroundColor Yellow
}

Write-Host "==> Ejecutando 01_schema_3fn.sql..." -ForegroundColor Cyan
& $PsqlPath -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $DbUser -d $DbName -f (Join-Path $scriptDir "01_schema_3fn.sql")

Write-Host "==> Ejecutando 02_triggers_inmutabilidad.sql..." -ForegroundColor Cyan
& $PsqlPath -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $DbUser -d $DbName -f (Join-Path $scriptDir "02_triggers_inmutabilidad.sql")

Write-Host "==> Ejecutando 03_seed_datos.sql..." -ForegroundColor Cyan
& $PsqlPath -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $DbUser -d $DbName -f (Join-Path $scriptDir "03_seed_datos.sql")

Write-Host "`n[OK] Base de datos '$DbName' inicializada correctamente en PostgreSQL 18." -ForegroundColor Green

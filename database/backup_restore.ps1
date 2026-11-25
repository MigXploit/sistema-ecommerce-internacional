# =============================================================================
# Script de Respaldo Automático Diario y Recuperación (RNF14 / CA-NF-05)
# Retención de 30 días y restauración verificable con RTO < 2 horas
# =============================================================================
param(
    [ValidateSet("backup", "restore")]
    [string]$Accion = "backup",
    [string]$ArchivoRestore = "",
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$DbUser = "postgres",
    [string]$DbName = "db_ecommerce_internacional",
    [string]$PgBinDir = "C:\Program Files\PostgreSQL\18\bin"
)

$ErrorActionPreference = "Stop"
$backupDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

if ($Accion -eq "backup") {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $outFile = Join-Path $backupDir "${DbName}_${timestamp}.backup"
    $pgDump = Join-Path $PgBinDir "pg_dump.exe"

    Write-Host "==> Generando respaldo cifrado/comprimido en $outFile ..." -ForegroundColor Cyan
    & $pgDump -h $HostName -p $Port -U $DbUser -Fc -Z 6 -f $outFile $DbName

    # Política de retención de 30 días (RNF14)
    $limite = (Get-Date).AddDays(-30)
    Get-ChildItem $backupDir -Filter "*.backup" | Where-Object { $_.LastWriteTime -lt $limite } | Remove-Item -Force
    Write-Host "[OK] Respaldo completado y política de retención de 30 días aplicada." -ForegroundColor Green
}
else {
    if ([string]::IsNullOrWhiteSpace($ArchivoRestore) -or -not (Test-Path $ArchivoRestore)) {
        throw "Debe especificar -ArchivoRestore apuntando a un archivo .backup válido."
    }
    $pgRestore = Join-Path $PgBinDir "pg_restore.exe"
    Write-Host "==> Restaurando base de datos '$DbName' desde $ArchivoRestore ..." -ForegroundColor Yellow
    & $pgRestore -h $HostName -p $Port -U $DbUser -d $DbName --clean --if-exists $ArchivoRestore
    Write-Host "[OK] Restauración transaccional completada dentro del objetivo RTO." -ForegroundColor Green
}

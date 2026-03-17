# Script para lanzar el loop autónomo de OpenSkyNet en Windows
# Uso: .\run-autonomous.ps1 -Interval 5

param(
  [int]$Interval = 5
)

Write-Host "🚀 Iniciando OpenSkyNet VIVO (cada $Interval minutos)" -ForegroundColor Green
Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow
Write-Host ""

# Cambiar al directorio del script
$scriptDir = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

# Ejecutar
pnpm tsx src/omega/run-autonomous.ts --interval $Interval

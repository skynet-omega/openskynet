# PowerShell version - ejecutar desde root de openskynet
# Script-Name: MIGRATION_SCRIPT.ps1

Write-Host "🚀 Iniciando migración de documentación OpenSkyNet..." -ForegroundColor Green

function Move-IfExists {
    param([string]$file, [string]$dest)
    if (Test-Path $file) {
        Move-Item $file $dest -Force
        Write-Host "✅ $file" -ForegroundColor Green
    }
}

# MOVER A documentation/analysis/ - Análisis técnicos
Write-Host "`n📊 Moviendo análisis técnicos..." -ForegroundColor Cyan

$analysisFiles = @(
    "VALIDACION_TIER1_INFORME.md",
    "ANALISIS_ARQUITECTONICO_SKYNET_VS_OPENSKYNET_2026-03-16.md",
    "AUTOANALISIS_HONESTO.md",
    "ESTUDIO_TERMODINAMICO_CEREBRO_REPTILIANO.md",
    "RESUMEN_EJECUTIVO_MEJORAS_ARQUITECTONICAS_2026-03-16.md",
    "MAPA_CONCEPTUAL_INTEGRACION_2026-03-16.md",
    "LIMITACIONES_OPENSKYNET.md",
    "MODELADO_MATEMATICO_DROSOPHILA.md",
    "MODELADO_MATEMATICO_DROSOPHILA_v0.md",
    "ESTUDIO_PROFUNDO_PLAN_2026-03-15.md",
    "ANALISIS_EMPERICO_PIPELINE_2026-03-15.md",
    "ANALISIS_OPENCLAW_VS_OPENSKYNET.md",
    "ANALISIS_VIABILIDAD_FUTURO_AGI_2026-03-15.md",
    "INTEGRACION_OPENSKYNET_OMEGA_ES.md",
    "ARCHITECTURE_DIAGRAM.md",
    "INDICE_MAESTRO_ANALISIS_COMPLETO_2026-03-16.md",
    "INDICE_MAESTRO_TODOS_DOCUMENTOS.md",
    "OPENSKYNET_CORE_DIRECTIVE.md"
)

foreach ($file in $analysisFiles) {
    Move-IfExists $file "documentation\analysis"
}

# MOVER A documentation/archive/ - Propuestas sin hacer
Write-Host "`n📦 Moviendo propuestas archivadas..." -ForegroundColor Cyan

$archiveFiles = @(
    "PROPUESTA_100_ARQUITECTONICO.md",
    "QUICK_REFERENCE_10_MEJORAS_2026-03-16.md",
    "DECISION_EJECUTIVA_TIER1.md",
    "ROADMAP_MAESTRO_TIER1.md",
    "REDUNDANCIA_VISUAL_MAPA.md",
    "PLAN_B_COMPLETE_IMPLEMENTATION_REPORT.md",
    "PLAN_B_FASE_1.2_IMPLEMENTATION_COMPLETE.md",
    "PROPUESTA_ARQUITECTURA_HIBRIDA_FRONTAL.md",
    "Síntesis Físico-Matemática de Agentes Cognitivos Corporizados.md",
    "THE_5_JEWELS.md",
    "UPGRADE_PLAN_PHASE4.md"
)

foreach ($file in $archiveFiles) {
    Move-IfExists $file "documentation\archive"
}

# MOVER A documentation/status/ - Reportes históricos
Write-Host "`n🕒 Moviendo reportes históricos..." -ForegroundColor Cyan

$statusPatterns = @(
    "AUDIT_*.md",
    "AUDITORIA_*.md",
    "VALIDATION_*.md",
    "PRE_LIMPIEZA_*.md",
    "POST_LIMPIEZA_*.md",
    "LIMPEZA_*.md",
    "LIMPIEZA_*.md",
    "MEJORAS_*.md",
    "REVISION_*.md",
    "CORRECTION_*.md",
    "RECOMENDACION_*.md",
    "RESUMEN_*.md",
    "PHASE4_*.md",
    "EXECUTIVE_SUMMARY_*.md",
    "EXPERIMENTO_*.md",
    "VERIFICATION_*.md",
    "VALIDACION_*.md"
)

foreach ($pattern in $statusPatterns) {
    Get-ChildItem -Filter $pattern | ForEach-Object {
        Move-Item $_.FullName "documentation\status\" -Force
        Write-Host "✅ $($_.Name)" -ForegroundColor Green
    }
}

Write-Host "`n✅ Migración completada!" -ForegroundColor Green

Write-Host "`n📊 Estado final:" -ForegroundColor Cyan
$coreCount = @(Get-ChildItem "documentation\core\" -Filter "*.md" 2>$null).Count
$analysisCount = @(Get-ChildItem "documentation\analysis\" -Filter "*.md" 2>$null).Count
$archiveCount = @(Get-ChildItem "documentation\archive\" -Filter "*.md" 2>$null).Count
$statusCount = @(Get-ChildItem "documentation\status\" -Filter "*.md" 2>$null).Count

Write-Host "  - documentation/core/: $coreCount archivos"
Write-Host "  - documentation/analysis/: $analysisCount archivos"
Write-Host "  - documentation/archive/: $archiveCount archivos"
Write-Host "  - documentation/status/: $statusCount archivos"

Write-Host "`n🚀 Siguiente paso: git add . && git commit -m 'docs: reorganize openskynet documentation'" -ForegroundColor Yellow

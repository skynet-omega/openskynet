#!/bin/bash
# Bash version - ejecutar desde root de openskynet

echo "🚀 Iniciando migración de documentación OpenSkyNet..."

# Función para mover archivo si existe
move_if_exists() {
    local file=$1
    local dest=$2
    if [ -f "$file" ]; then
        mv "$file" "$dest/"
        echo "✅ $file"
    fi
}

# MOVER A documentation/analysis/ - Análisis técnicos
echo -e "\n📊 Moviendo análisis técnicos..."
move_if_exists "VALIDACION_TIER1_INFORME.md" "documentation/analysis"
move_if_exists "ANALISIS_ARQUITECTONICO_SKYNET_VS_OPENSKYNET_2026-03-16.md" "documentation/analysis"
move_if_exists "AUTOANALISIS_HONESTO.md" "documentation/analysis"
move_if_exists "ESTUDIO_TERMODINAMICO_CEREBRO_REPTILIANO.md" "documentation/analysis"
move_if_exists "RESUMEN_EJECUTIVO_MEJORAS_ARQUITECTONICAS_2026-03-16.md" "documentation/analysis"
move_if_exists "MAPA_CONCEPTUAL_INTEGRACION_2026-03-16.md" "documentation/analysis"
move_if_exists "LIMITACIONES_OPENSKYNET.md" "documentation/analysis"
move_if_exists "MODELADO_MATEMATICO_DROSOPHILA.md" "documentation/analysis"
move_if_exists "MODELADO_MATEMATICO_DROSOPHILA_v0.md" "documentation/analysis"
move_if_exists "ESTUDIO_PROFUNDO_PLAN_2026-03-15.md" "documentation/analysis"
move_if_exists "ANALISIS_EMPERICO_PIPELINE_2026-03-15.md" "documentation/analysis"
move_if_exists "ANALISIS_OPENCLAW_VS_OPENSKYNET.md" "documentation/analysis"
move_if_exists "ANALISIS_VIABILIDAD_FUTURO_AGI_2026-03-15.md" "documentation/analysis"
move_if_exists "INTEGRACION_OPENSKYNET_OMEGA_ES.md" "documentation/analysis"
move_if_exists "ARCHITECTURE_DIAGRAM.md" "documentation/analysis"
move_if_exists "INDICE_MAESTRO_ANALISIS_COMPLETO_2026-03-16.md" "documentation/analysis"
move_if_exists "INDICE_MAESTRO_TODOS_DOCUMENTOS.md" "documentation/analysis"
move_if_exists "OPENSKYNET_CORE_DIRECTIVE.md" "documentation/analysis"

# MOVER A documentation/archive/ - Propuestas sin hacer
echo -e "\n📦 Moviendo propuestas archivadas..."
move_if_exists "PROPUESTA_100_ARQUITECTONICO.md" "documentation/archive"
move_if_exists "QUICK_REFERENCE_10_MEJORAS_2026-03-16.md" "documentation/archive"
move_if_exists "DECISION_EJECUTIVA_TIER1.md" "documentation/archive"
move_if_exists "ROADMAP_MAESTRO_TIER1.md" "documentation/archive"
move_if_exists "REDUNDANCIA_VISUAL_MAPA.md" "documentation/archive"
move_if_exists "PLAN_B_COMPLETE_IMPLEMENTATION_REPORT.md" "documentation/archive"
move_if_exists "PLAN_B_FASE_1.2_IMPLEMENTATION_COMPLETE.md" "documentation/archive"
move_if_exists "PROPUESTA_ARQUITECTURA_HIBRIDA_FRONTAL.md" "documentation/archive"
move_if_exists "Síntesis Físico-Matemática de Agentes Cognitivos Corporizados.md" "documentation/archive"
move_if_exists "THE_5_JEWELS.md" "documentation/archive"
move_if_exists "UPGRADE_PLAN_PHASE4.md" "documentation/archive"

# MOVER A documentation/status/ - Reportes históricos
echo -e "\n🕒 Moviendo reportes históricos..."
for f in AUDIT_*.md AUDITORIA_*.md VALIDATION_*.md PRE_LIMPIEZA_*.md POST_LIMPIEZA_*.md LIMPEZA_*.md LIMPIEZA_*.md MEJORAS_*.md REVISION_*.md CORRECTION_*.md RECOMENDACION_*.md RESUMEN_*.md PHASE4_*.md EXECUTIVE_SUMMARY_*.md EXPERIMENTO_*.md VERIFICATION_*.md VALIDACION_*.md; do
    [ -f "$f" ] && mv "$f" "documentation/status/" && echo "✅ $f"
done

echo -e "\n✅ Migración completada!"
echo -e "\n📊 Estado final:"
echo "  - documentation/core/: $(ls documentation/core/*.md 2>/dev/null | wc -l) archivos"
echo "  - documentation/analysis/: $(ls documentation/analysis/*.md 2>/dev/null | wc -l) archivos"
echo "  - documentation/archive/: $(ls documentation/archive/*.md 2>/dev/null | wc -l) archivos"
echo "  - documentation/status/: $(ls documentation/status/*.md 2>/dev/null | wc -l) archivos"

echo -e "\n🚀 Siguiente paso: git add . && git commit -m 'docs: reorganize openskynet documentation'"

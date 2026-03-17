#!/bin/bash
# Script para lanzar el loop autónomo de OpenSkyNet
# Uso: ./run-autonomous.sh [minutos]

INTERVAL=${1:-5}

echo "🚀 Iniciando OpenSkyNet VIVO (cada $INTERVAL minutos)"
echo "Presiona Ctrl+C para detener"
echo ""

cd "$(dirname "$0")" || exit
pnpm tsx src/omega/run-autonomous.ts --interval "$INTERVAL"

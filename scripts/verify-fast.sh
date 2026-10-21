#!/usr/bin/env bash
# Verificação rápida do dia a dia (≈1–2 min): tipos + lint + só os testes pedidos.
# Uso: scripts/verify-fast.sh [padrão-de-teste ...]   ex.: scripts/verify-fast.sh legalmail-f4 case-import
# A suíte inteira (testes completos + navegador + build) roda no GitHub (CI) a cada push e no fechamento de cada lote.
set -euo pipefail
npx tsc --noEmit
npx eslint src --quiet
if [ "$#" -gt 0 ]; then npx vitest run "$@"; else echo "(nenhum teste pedido: só tipos e lint)"; fi

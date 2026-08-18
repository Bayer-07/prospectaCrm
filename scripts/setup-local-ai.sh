#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OVERRIDE_FILE="${AI_GPU_OVERRIDE_FILE:-docker-compose.ai-gpu.yml}"
compose_files=(-f docker-compose.yml)

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf 'Erro: %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail 'Docker não encontrado.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 não encontrado.'
[[ -f .env ]] || fail 'Crie o arquivo .env antes de configurar a IA.'
read_env_value() {
  local key="$1"
  awk -v key="$key" '
    index($0, key "=") == 1 { value = substr($0, length(key) + 2) }
    END {
      sub(/\r$/, "", value)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      first = substr(value, 1, 1)
      last = substr(value, length(value), 1)
      if ((first == "\"" && last == "\"") || (first == "\047" && last == "\047")) {
        value = substr(value, 2, length(value) - 2)
      }
      print value
    }
  ' .env
}

configured_model="$(read_env_value OLLAMA_MODEL)"
MODEL="${OLLAMA_MODEL:-${configured_model:-qwen3:4b-instruct}}"

gpu_ready=0
if command -v nvidia-smi >/dev/null 2>&1; then
  log 'GPU NVIDIA encontrada'
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || true
  if command -v nvidia-ctk >/dev/null 2>&1 && docker info 2>/dev/null | grep -qi nvidia; then
    gpu_ready=1
  else
    printf 'NVIDIA Container Toolkit não está configurado; usando CPU.\n'
    printf 'Para habilitar GPU: instale nvidia-container-toolkit, execute sudo nvidia-ctk runtime configure --runtime=docker e reinicie o Docker.\n'
  fi
else
  printf 'nvidia-smi não encontrado; usando CPU.\n'
fi

if [[ "$gpu_ready" == "1" ]]; then
  log 'Gerando override de GPU'
  cat > "$OVERRIDE_FILE" <<'YAML'
services:
  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
YAML
  compose_files+=(-f "$OVERRIDE_FILE")
fi

compose() { docker compose "${compose_files[@]}" --profile ai "$@"; }

log 'Subindo o Ollama'
compose up -d --wait ollama

log "Baixando o modelo $MODEL"
compose exec -T ollama ollama pull "$MODEL"

log 'Executando smoke test em português'
test_output="$(compose exec -T ollama ollama run "$MODEL" 'Responda apenas: IA local pronta.' 2>&1)"
printf '%s\n' "$test_output"
[[ -n "$test_output" ]] || fail 'O modelo não retornou conteúdo.'

log 'Configuração concluída'
printf 'Ative AI_ASSISTANT_ENABLED=true no .env e execute ./rebuild.sh --with-ai.\n'

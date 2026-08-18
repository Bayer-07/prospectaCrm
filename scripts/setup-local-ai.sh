#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OVERRIDE_FILE="${AI_GPU_OVERRIDE_FILE:-docker-compose.ai-gpu.yml}"
DEFAULT_OVERRIDE_FILE="docker-compose.ai-gpu.yml"
compose_files=(-f docker-compose.yml)
MIN_GPU_VRAM_MB="${OLLAMA_MIN_GPU_VRAM_MB:-4096}"
SMOKE_TIMEOUT_SECONDS="${OLLAMA_SMOKE_TIMEOUT_SECONDS:-150}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf 'Erro: %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail 'Docker não encontrado.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 não encontrado.'
command -v curl >/dev/null 2>&1 || fail 'curl não encontrado.'
command -v python3 >/dev/null 2>&1 || fail 'python3 não encontrado.'
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
configured_bind_port="$(read_env_value OLLAMA_BIND_PORT)"
BIND_PORT="${OLLAMA_BIND_PORT:-${configured_bind_port:-11434}}"

[[ "$MIN_GPU_VRAM_MB" =~ ^[0-9]+$ ]] || fail 'OLLAMA_MIN_GPU_VRAM_MB deve ser um número inteiro.'
[[ "$SMOKE_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || fail 'OLLAMA_SMOKE_TIMEOUT_SECONDS deve ser um número inteiro.'
[[ "$BIND_PORT" =~ ^[0-9]+$ ]] && (( BIND_PORT >= 1 && BIND_PORT <= 65535 )) || fail 'OLLAMA_BIND_PORT deve ser uma porta válida.'

gpu_ready=0
gpu_memory_mb=0
if command -v nvidia-smi >/dev/null 2>&1; then
  log 'GPU NVIDIA encontrada'
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || true
  gpu_memory_mb="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | awk 'BEGIN { max = 0 } $1 + 0 > max { max = $1 + 0 } END { print max }')"
  if (( gpu_memory_mb < MIN_GPU_VRAM_MB )); then
    printf 'Maior GPU: %s MiB de VRAM; minimo seguro: %s MiB. Usando CPU.\n' "$gpu_memory_mb" "$MIN_GPU_VRAM_MB"
  elif command -v nvidia-ctk >/dev/null 2>&1 && docker info 2>/dev/null | grep -qi nvidia; then
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
elif [[ -z "${AI_GPU_OVERRIDE_FILE:-}" && -f "$DEFAULT_OVERRIDE_FILE" ]]; then
  log 'Removendo override de GPU incompatível'
  rm -f -- "$DEFAULT_OVERRIDE_FILE"
fi

compose() { docker compose "${compose_files[@]}" --profile ai "$@"; }

log 'Subindo o Ollama'
compose up -d --wait ollama

log "Baixando o modelo $MODEL"
compose exec -T ollama ollama pull "$MODEL"

log 'Executando smoke test em português'
smoke_payload="$(MODEL="$MODEL" python3 - <<'PY'
import json
import os

print(json.dumps({
    "model": os.environ["MODEL"],
    "prompt": "Responda apenas: IA local pronta.",
    "stream": False,
    "think": False,
    "keep_alive": "2m",
    "options": {"num_predict": 16},
}))
PY
)"
if ! test_output="$(timeout "$SMOKE_TIMEOUT_SECONDS" curl --fail --silent --show-error \
  --connect-timeout 10 --max-time "$SMOKE_TIMEOUT_SECONDS" \
  --header 'Content-Type: application/json' \
  --data-binary "$smoke_payload" \
  "http://127.0.0.1:${BIND_PORT}/api/generate" 2>&1)"; then
  fail "O smoke test não terminou em até ${SMOKE_TIMEOUT_SECONDS}s. Consulte: docker logs prospecta-ollama-1"
fi
if ! generated_text="$(printf '%s' "$test_output" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("response", "").strip())')"; then
  fail 'O Ollama retornou uma resposta inválida no smoke test.'
fi
printf '%s\n' "$generated_text"
[[ -n "$generated_text" ]] || fail 'O modelo não retornou conteúdo.'

log 'Configuração concluída'
printf 'Ative AI_ASSISTANT_ENABLED=true no .env e execute ./rebuild.sh --with-ai.\n'

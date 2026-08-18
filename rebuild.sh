#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

UPDATE_CODE="${UPDATE_CODE:-1}"
REBUILD_EVOLUTION="${REBUILD_EVOLUTION:-0}"
PULL_BASE_IMAGES="${PULL_BASE_IMAGES:-0}"
WITH_AI="${WITH_AI:-0}"

usage() {
  cat <<'EOF'
Uso: ./rebuild.sh [opções]

Atualiza e republica o BZS One sem recriar os serviços que guardam dados.

Opções:
  --no-pull          não executa git pull
  --with-evolution   também reconstrói a imagem customizada da Evolution API
  --pull-images      atualiza as imagens-base durante o build
  --with-ai          sobe o Ollama, preserva o volume e garante o modelo configurado
  -h, --help         mostra esta ajuda

Variáveis opcionais:
  COMPOSE_OVERRIDE_FILE  arquivo Compose adicional
  UPDATE_CODE=0          equivalente a --no-pull
  REBUILD_EVOLUTION=1    equivalente a --with-evolution
  PULL_BASE_IMAGES=1     equivalente a --pull-images
  WITH_AI=1              equivalente a --with-ai
EOF
}

while (($# > 0)); do
  case "$1" in
    --no-pull)
      UPDATE_CODE=0
      ;;
    --with-evolution)
      REBUILD_EVOLUTION=1
      ;;
    --pull-images)
      PULL_BASE_IMAGES=1
      ;;
    --with-ai)
      WITH_AI=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Opção desconhecida: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

on_error() {
  local exit_code=$?
  printf '\nFalha no rebuild (linha %s, código %s). Os volumes de dados não foram removidos.\n' \
    "${BASH_LINENO[0]:-desconhecida}" "$exit_code" >&2
  exit "$exit_code"
}
trap on_error ERR

log() {
  local message="$1"
  printf '\n\033[1;36m==> %s\033[0m\n' "$message"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Comando obrigatório não encontrado: %s\n' "$command_name" >&2
    exit 1
  fi
}

require_command docker

if ! docker compose version >/dev/null 2>&1; then
  printf 'O plugin Docker Compose v2 não está disponível.\n' >&2
  exit 1
fi

if [[ "$UPDATE_CODE" == "1" ]]; then
  require_command git

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
      printf 'Há alterações locais rastreadas pelo Git. Commit ou reverta essas alterações antes do rebuild.\n' >&2
      printf 'Se quiser reconstruir exatamente o código atual, use: ./rebuild.sh --no-pull\n' >&2
      exit 1
    fi

    log "Atualizando o código"
    previous_revision="$(git rev-parse HEAD)"
    git pull --ff-only
    current_revision="$(git rev-parse HEAD)"

    if [[ "$previous_revision" != "$current_revision" ]]; then
      reexec_args=(--no-pull)
      [[ "$REBUILD_EVOLUTION" == "1" ]] && reexec_args+=(--with-evolution)
      [[ "$PULL_BASE_IMAGES" == "1" ]] && reexec_args+=(--pull-images)
      [[ "$WITH_AI" == "1" ]] && reexec_args+=(--with-ai)
      log "Reiniciando o rebuild com a versão atualizada do script"
      exec bash "$ROOT_DIR/rebuild.sh" "${reexec_args[@]}"
    fi
  else
    printf 'Aviso: este diretório não é um repositório Git; seguindo sem atualizar o código.\n' >&2
  fi
fi

if [[ ! -f .env ]]; then
  printf 'Arquivo .env não encontrado em %s\n' "$ROOT_DIR" >&2
  exit 1
fi
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

configured_ollama_model="$(read_env_value OLLAMA_MODEL)"
ollama_model="${OLLAMA_MODEL:-${configured_ollama_model:-qwen3:4b-instruct}}"

compose_files=(-f docker-compose.yml)
compose_profiles=()
if [[ "$WITH_AI" == "1" ]]; then
  compose_profiles+=(--profile ai)
fi
tailscale_mode=0

if [[ -f docker-compose.tailscale.yml ]]; then
  compose_files+=(-f docker-compose.tailscale.yml)
  tailscale_mode=1
fi

if [[ -n "${COMPOSE_OVERRIDE_FILE:-}" ]]; then
  if [[ ! -f "$COMPOSE_OVERRIDE_FILE" ]]; then
    printf 'Arquivo Compose adicional não encontrado: %s\n' "$COMPOSE_OVERRIDE_FILE" >&2
    exit 1
  fi
  compose_files+=(-f "$COMPOSE_OVERRIDE_FILE")
fi

compose() {
  docker compose "${compose_files[@]}" "${compose_profiles[@]}" "$@"
}

log "Validando a configuração do Docker Compose"
compose config --quiet

build_services=(api worker web mcp)
deploy_services=(api worker web mcp evolution transcription)
if [[ "$WITH_AI" == "1" ]]; then
  deploy_services+=(ollama)
fi

if [[ "$REBUILD_EVOLUTION" == "1" ]]; then
  build_services+=(evolution)
fi

# No servidor com Funnel, o frontend é publicado pelo override do Tailscale e
# o Caddy local não deve disputar as portas 80/443.
if [[ "$tailscale_mode" == "0" ]]; then
  deploy_services+=(caddy)
fi

build_args=()
if [[ "$PULL_BASE_IMAGES" == "1" ]]; then
  build_args+=(--pull)
fi

log "Garantindo que PostgreSQL, Redis e MinIO estejam saudáveis"
compose up -d --wait postgres redis minio

log "Reconstruindo as imagens da aplicação: ${build_services[*]}"
compose build "${build_args[@]}" "${build_services[@]}"

log "Aplicando as migrações do banco de dados"
compose run --rm --no-deps api pnpm --filter @prospecta/database db:deploy

if [[ "$WITH_AI" == "1" ]]; then
  log "Aguardando o Ollama ficar saudável"
  compose up -d --wait ollama
  log "Garantindo o modelo local de IA"
  compose exec -T ollama ollama pull "$ollama_model"
fi

log "Publicando os novos containers"
compose up -d --remove-orphans "${deploy_services[@]}"

log "Aguardando a API responder"
api_ready=0
for _ in {1..30}; do
  if compose exec -T api wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1; then
    api_ready=1
    break
  fi
  sleep 2
done

if [[ "$api_ready" != "1" ]]; then
  printf 'A API não ficou saudável dentro de 60 segundos. Últimos logs:\n' >&2
  compose logs --tail=100 api >&2
  exit 1
fi

log "Rebuild concluído"
compose ps

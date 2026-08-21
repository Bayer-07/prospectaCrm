# ADR 009 — URLs relativas e proxy de borda para desenvolvimento, LAN e Tailscale

- **Status:** aceito (retroativo)
- **Data reconstruída:** 2026-07-21 a 2026-07-26
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commits `a04ce30`, `295eece`, `fb972cc`, `5d3d2e2`

## Contexto

O mesmo frontend precisa funcionar em `localhost`, IP de rede local e domínio Tailscale/Funnel. Endereços absolutos fixos ficaram inválidos quando o IP mudou e URLs de mídia precisaram atravessar a borda sem expor MinIO diretamente.

## Decisão

- O navegador usa rotas relativas `/api`, `/socket.io` e mídia controlada.
- Em desenvolvimento, Vite faz proxy para a API e recebe `allowedHosts` por ambiente.
- Em contêiner, Nginx/Caddy encaminham frontend, API, Socket.IO e mídia para os serviços internos.
- Endereços entre contêineres usam nomes DNS internos; somente a borda recebe exposição pública.
- Hosts, origens e URLs públicas são configuração de ambiente, não constantes de código.

## Consequências

### Positivas

- Mudança de IP não exige rebuild por links hardcoded.
- Cookies e CORS permanecem no mesmo origin público.
- MinIO, API interna e Evolution podem continuar sem porta pública direta.

### Negativas

- Regras de proxy precisam suportar streaming, arquivos grandes, Socket.IO e timeouts.
- Configuração divergente entre Vite, Nginx, Caddy e Tailscale pode produzir 502 ou host bloqueado.
- URLs assinadas dependem de a borda encaminhar exatamente o caminho esperado.

## Alternativas consideradas

- `http://localhost`/IP fixo no frontend: rejeitado após falhas em outra máquina e mudança de IP.
- Expor cada serviço em uma porta pública: amplia superfície de ataque e complica CORS.
- Descoberta dinâmica no navegador: desnecessária quando o proxy de mesmo origin resolve o problema.

## Evidências atuais

`apps/web/vite.config.ts`, configuração Nginx da web, `Caddyfile`, `docker-compose.yml`, `.env.example` e serviços de mídia.

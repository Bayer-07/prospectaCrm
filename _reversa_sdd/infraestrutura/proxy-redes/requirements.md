# Proxy e redes — Requisitos

## Objetivo

Servir a aplicação por origem única local ou Tailscale, encaminhando API, Socket.IO e mídias sem hosts fixos. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INFRAESTRUTURA-2-FR-001 | Proxyar /api e /socket.io para a API e o restante para a web. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-2-FR-002 | Aceitar hostname permitido via configuração, não alteração manual de Vite por IP. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-2-FR-003 | Usar Tailscale Serve/Funnel sobre uma porta local sem disputar 443 com Caddy. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-2-FR-004 | Manter MinIO privado e gerar URLs acessíveis pelo proxy autorizado. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-2-FR-005 | Aplicar cabeçalhos de segurança e CSP homologada. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de proxy e redes
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`Caddyfile`, `docker-compose.tailscale.yml`, `apps/web/nginx.conf`, `apps/web/vite.config.ts`. **[CONFIRMADO]**

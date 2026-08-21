# Infraestrutura e implantação — Requisitos

## Visão geral

Executar o BZS One auto-hospedado por Docker Compose com proxy, bancos, filas, objetos, Evolution, transcrição e serviços internos isolados. **[CONFIRMADO]**

## Regras de negócio

1. Somente os pontos de entrada necessários são publicados; bancos e credenciais permanecem na rede interna. **[CONFIRMADO]**
2. URLs da aplicação derivam de ambiente/origem, sem IP fixo no código. **[CONFIRMADO]**
3. Volumes persistentes sobrevivem a rebuild e force-recreate. **[CONFIRMADO]**
4. Evolution roda sem root após init que corrige ownership de volume legado. **[CONFIRMADO]**
5. Segredos obrigatórios falham fechados; .env.example não contém credencial utilizável. **[CONFIRMADO]**
6. Backup deve cobrir PostgreSQL e MinIO e possuir teste de restauração. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INFRAESTRUTURA-FR-001 | Subir serviços com dependências, healthchecks, redes e volumes coerentes. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| INFRAESTRUTURA-FR-002 | Servir a aplicação por origem única local ou Tailscale, encaminhando API, Socket.IO e mídias sem hosts fixos. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| INFRAESTRUTURA-FR-003 | Atualizar imagens, migrações e serviços por um script repetível sem destruir volumes. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| INFRAESTRUTURA-FR-004 | Criar backups externos criptografados de PostgreSQL e MinIO com retenção e teste periódico de restauração. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| INFRAESTRUTURA-FR-099 | Falhar de modo seguro quando configuração, dependência ou autorização obrigatória estiver ausente. **[CONFIRMADO]** | Must | Nenhum dado protegido ou efeito parcial é produzido. **[INFERIDO]** |

## Requisitos não funcionais

- Configuração varia por ambiente e nenhum endereço de desenvolvimento é fixado no código de domínio. **[CONFIRMADO]**
- Operações volumosas usam paginação, streaming, lote ou fila conforme sua natureza. **[INFERIDO]**
- Logs e respostas não expõem chaves, senhas, cookies ou URLs assinadas duradouras. **[CONFIRMADO]**
- A interface e os serviços opcionais degradam de forma isolada. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: operar infraestrutura e implantação com configuração válida
  Dado que dependências, credenciais e permissões necessárias estão disponíveis
  Quando o caso de uso é executado
  Então o resultado é consistente e rastreável
  E nenhuma fronteira interna é exposta indevidamente
```
**[INFERIDO]**

## MoSCoW

- **Must:** regras, isolamento, segurança e casos de uso documentados. **[CONFIRMADO]**
- **Should:** healthcheck, observabilidade e recuperação orientada. **[INFERIDO]**
- **Could:** automação operacional adicional após métricas reais. **[A VALIDAR]**
- **Won’t:** depender de segredo ou IP hardcoded no repositório. **[CONFIRMADO]**

## Rastreabilidade

`docker-compose.yml`, `docker-compose.tailscale.yml`, `Caddyfile`, `apps/web/nginx.conf`, `rebuild.sh`, `scripts/backup.sh`, `.env.example`, `README.md`. **[CONFIRMADO]**

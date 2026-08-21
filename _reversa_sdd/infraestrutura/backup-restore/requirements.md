# Backup e restauração — Requisitos

## Objetivo

Criar backups externos criptografados de PostgreSQL e MinIO com retenção e teste periódico de restauração. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INFRAESTRUTURA-4-FR-001 | Executar backup noturno de banco e objetos. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-4-FR-002 | Criptografar antes de transferir para armazenamento externo. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-4-FR-003 | Manter 30 cópias diárias e 12 semanais. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-4-FR-004 | Verificar checksum, resultado do upload e alertar falha. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-4-FR-005 | Restaurar em ambiente isolado e registrar teste periódico. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de backup e restauração
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`scripts/backup.sh`, `docker-compose.yml`, `README.md`. **[CONFIRMADO]**

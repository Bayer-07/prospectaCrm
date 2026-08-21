# Rebuild e deploy — Requisitos

## Objetivo

Atualizar imagens, migrações e serviços por um script repetível sem destruir volumes. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INFRAESTRUTURA-3-FR-001 | Oferecer rebuild.sh com pull opcional e perfis necessários. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-3-FR-002 | Executar build quando o código mudou; force-recreate sozinho não basta. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-3-FR-003 | Aplicar migrações antes de liberar versão dependente do schema. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-3-FR-004 | Preservar volumes e apresentar a linha de falha. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INFRAESTRUTURA-3-FR-005 | Documentar instalação inicial e atualização futura no Ubuntu Server. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de rebuild e deploy
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`rebuild.sh`, `README.md`, `docker-compose.yml`. **[CONFIRMADO]**

# Autenticação e navegação — Requisitos

## Objetivo

Restaurar sessão, proteger rotas e oferecer menu lateral coerente com módulos e permissões. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INTERFACE_WEB-1-FR-001 | Mostrar somente login até /auth/me confirmar sessão. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-1-FR-002 | Em qualquer 401, limpar estado e voltar ao login. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-1-FR-003 | Sincronizar logout entre abas e recarregar a página. **[CONFIRMADO]** | Must | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-1-FR-004 | Organizar Integrações com submenus API, Swagger, Webhooks e IA e manter Conexões no menu lateral. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |
| INTERFACE_WEB-1-FR-005 | Exibir BZS One e logo oficial sem texto Plataforma interna. **[CONFIRMADO]** | Should | O comportamento é verificável sem expor segredo nem produzir efeito parcial. **[INFERIDO]** |

## Regras transversais

- Autenticação, autorização e isolamento são aplicados no servidor. **[CONFIRMADO]**
- Configuração específica do ambiente não é incorporada ao bundle ou domínio. **[CONFIRMADO]**
- Mudança incompatível exige atualização de contrato e teste. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de autenticação e navegação
  Dado que a configuração e o acesso são válidos
  Quando o fluxo é executado
  Então o resultado observado corresponde ao estado persistido
  E falhas deixam diagnóstico seguro e recuperável
```
**[INFERIDO]**

## Rastreabilidade

`apps/web/src/App.tsx`, `apps/web/src/components/Shell.tsx`, `apps/web/src/pages/Auth.tsx`, `apps/web/src/lib/api.ts`. **[CONFIRMADO]**

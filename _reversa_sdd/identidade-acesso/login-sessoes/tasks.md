# Login e sessões — Tarefas

- [ ] Recriar as rotas de login, logout e contexto atual a partir de `apps/api/src/auth/auth.controller.ts`; pronto quando os envelopes e cookies coincidirem com os contratos. **[CONFIRMADO]**
- [ ] Recriar verificação Argon2id e limite de cinco falhas em quinze minutos a partir de `auth.service.ts`; pronto quando testes cobrirem usuário ausente, inativo e senha errada sem enumeração. **[CONFIRMADO]**
- [ ] Recriar persistência e expiração de sete dias de `Session`; pronto quando sessão revogada/expirada retornar `401`. **[CONFIRMADO]**
- [ ] Recriar `AuthGuard` e `AuthCacheService`; pronto quando cache hit, miss, limite e invalidação estiverem testados. **[CONFIRMADO]**
- [ ] Recriar dupla cookie/CSRF e `CsrfGuard`; pronto quando mutações sem cabeçalho válido retornarem `403`. **[CONFIRMADO]**
- [ ] Recriar o provedor de autenticação da web; pronto quando carregamento, expiração e logout removem conteúdo protegido em todas as abas ao próximo acesso. **[CONFIRMADO]**
- [ ] Testar cookies por HTTPS atrás do proxy de produção e por HTTP no ambiente local permitido. **[INFERIDO]**
- [ ] Medir consultas ao banco antes/depois do cache para confirmar benefício e ausência de dados obsoletos. **[A VALIDAR]**

## Definição de pronto

- [ ] Cenários `LOGIN-FR-001` a `LOGIN-FR-006` passam em testes automatizados. **[INFERIDO]**
- [ ] Nenhum token ou senha aparece em logs ou snapshots. **[INFERIDO]**
- [ ] Typecheck, lint, testes e build de API/web estão verdes. **[INFERIDO]**

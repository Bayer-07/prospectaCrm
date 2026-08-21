# Chaves de API — Tarefas

- [ ] Recriar geração criptograficamente aleatória e hash de `pk_`; pronto quando o banco não contiver o token recuperável. **[CONFIRMADO]**
- [ ] Recriar metadados de nome, escopos, expiração, revogação e último uso; pronto quando estados inválidos retornarem `401`. **[CONFIRMADO]**
- [ ] Recriar autenticação e cache do `AuthGuard`; pronto quando cache hit/miss e falha de atualização forem testados. **[CONFIRMADO]**
- [ ] Recriar allowlist de rotas públicas; pronto quando usuários, campanhas, conexões e envio direto continuarem inacessíveis. **[CONFIRMADO]**
- [ ] Recriar verificação de escopos e filtros de organização; pronto quando uma chave não puder cruzar organizações ou ações. **[CONFIRMADO]**
- [ ] Recriar idempotência para criações externas; pronto quando repetição concorrente não duplicar registros. **[CONFIRMADO]**
- [ ] Documentar cópia única, rotação e revogação na interface e no Swagger. **[INFERIDO]**
- [ ] Avaliar invalidação distribuída antes de escalar a API horizontalmente. **[A VALIDAR]**

## Definição de pronto

- [ ] Requisitos `KEY-FR-001` a `KEY-FR-005` estão cobertos por unitários e integração. **[INFERIDO]**
- [ ] Nenhum teste ou log imprime token completo. **[INFERIDO]**
- [ ] A especificação OpenAPI contém apenas operações públicas deliberadas. **[INFERIDO]**

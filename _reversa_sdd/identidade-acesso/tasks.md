# Identidade e acesso — Tarefas de reconstrução

## Pré-requisitos

- [ ] Confirmar variáveis `SESSION_SECRET`, `ENCRYPTION_KEY`, URL pública e configuração do provedor transacional sem registrar os valores. **[CONFIRMADO]**
- [ ] Aplicar as migrações que criam usuários, papéis, permissões, sessões, convites, redefinições, chaves e auditoria. **[CONFIRMADO]**
- [ ] Executar o seed somente com senha administrativa não vazia e não previsível. **[CONFIRMADO]**
- [ ] Confirmar HTTPS e política de cookies no ambiente alvo antes de homologar login. **[INFERIDO]**

## Implementação por camada

### Contratos e banco

- [ ] Reconstruir os schemas de entrada e saída de autenticação a partir de `packages/contracts/src/auth.ts`; concluído quando payloads inválidos são rejeitados sem alcançar os serviços. **[CONFIRMADO]**
- [ ] Reconstruir os modelos e índices de identidade a partir de `packages/database/prisma/schema.prisma`; concluído quando unicidade, expiração e relações históricas passam nos testes de integração. **[CONFIRMADO]**
- [ ] Preservar desativação lógica de usuário e vínculos históricos; concluído quando exclusão não remove auditoria, conversas ou atividades relacionadas. **[CONFIRMADO]**

### API

- [ ] Implementar login, logout e `me` conforme `apps/api/src/auth/auth.controller.ts`; concluído quando cookies, expiração, CSRF e erros seguem os contratos. **[CONFIRMADO]**
- [ ] Implementar hash Argon2id, limite de tentativas e tokens temporários conforme `apps/api/src/auth/auth.service.ts`; concluído quando os testes de sucesso, expiração, reuso e bloqueio passam. **[CONFIRMADO]**
- [ ] Implementar autenticação híbrida no `AuthGuard`; concluído quando cookie e `pk_` produzem `AuthContext` e credenciais inválidas retornam `401`. **[CONFIRMADO]**
- [ ] Implementar autorização por recurso, ação e escopo; concluído quando acesso direto a dados fora do escopo retorna `403` ou não encontra registros. **[CONFIRMADO]**
- [ ] Implementar convites, perfil, usuários, papéis e chaves conforme `apps/api/src/users`; concluído quando todas as invariantes e auditorias possuem testes. **[CONFIRMADO]**

### Interface

- [ ] Reconstruir tela de login e recuperação; concluído quando erros são apresentados por toast e `401` remove o estado autenticado. **[CONFIRMADO]**
- [ ] Reconstruir sincronização entre abas; concluído quando logout ou expiração em uma aba impede leitura protegida nas demais ao próximo acesso. **[CONFIRMADO]**
- [ ] Reconstruir administração de membros, papéis e convites; concluído quando ações indisponíveis ficam ocultas e a API continua sendo a autoridade. **[CONFIRMADO]**
- [ ] Reconstruir perfil, preferência de assinatura e foto; concluído quando upload, visualização e remoção respeitam autorização e URLs temporárias. **[CONFIRMADO]**
- [ ] Garantir acessibilidade por teclado, foco visível e mensagens de erro associadas aos campos. **[INFERIDO]**

## Testes obrigatórios

- [ ] Unitários: normalização de e-mail, senha mínima, expiração, hash, CSRF, cache e combinação de permissões. **[CONFIRMADO]**
- [ ] Integração: sessão em PostgreSQL, convite de uso único, reset de senha, desativação e chave expirada. **[CONFIRMADO]**
- [ ] Segurança: enumeração de conta, força bruta, cookie ausente, CSRF divergente, rota de chave fora da allowlist e escopo de outra equipe. **[CONFIRMADO]**
- [ ] E2E: login em duas abas, logout, recarregamento, convite por e-mail, recuperação e edição de papel. **[INFERIDO]**
- [ ] Carga: até vinte usuários simultâneos sem consulta de sessão ao banco em toda requisição. **[INFERIDO]**

## Lacunas e melhorias controladas

- [ ] Decidir se MFA ou SSO entra no roadmap; não alterar o fluxo atual sem ADR. **[A VALIDAR]**
- [ ] Medir taxa de acerto e pressão de memória do `AuthCacheService`; adotar Redis somente se múltiplas réplicas justificarem a complexidade. **[A VALIDAR]**
- [ ] Avaliar política de senha mais forte preservando convites e redefinições existentes. **[A VALIDAR]**
- [ ] Documentar rotação e revogação de chaves de API na interface administrativa. **[INFERIDO]**

## Definição de pronto

- [ ] Requisitos `IAM-FR-001` a `IAM-FR-011` possuem teste automatizado ou evidência manual registrada. **[INFERIDO]**
- [ ] Typecheck, lint, testes unitários, testes de integração e build de API e web estão verdes. **[INFERIDO]**
- [ ] Nenhum segredo real aparece no repositório, nos logs de teste ou na documentação. **[INFERIDO]**
- [ ] A matriz código→spec aponta controladores, serviços, entidades, páginas e testes deste módulo. **[INFERIDO]**

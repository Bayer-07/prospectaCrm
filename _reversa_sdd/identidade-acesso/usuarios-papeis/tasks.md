# Usuários e papéis — Tarefas

- [ ] Recriar listagem e metadados a partir de `users.controller.ts`; pronto quando a organização e `users:read` delimitarem a resposta. **[CONFIRMADO]**
- [ ] Recriar edição/desativação a partir de `users.service.ts`; pronto quando e-mail ativo único, último administrador e preservação histórica estiverem testados. **[CONFIRMADO]**
- [ ] Recriar substituição transacional de permissões; pronto quando recurso, ação e escopo inválidos não alterarem o papel. **[CONFIRMADO]**
- [ ] Recriar perfil e preferência de assinatura; pronto quando o usuário não puder alterar papel/equipe por mass assignment. **[CONFIRMADO]**
- [ ] Recriar foto com `MediaAsset`; pronto quando apenas mídia permitida puder ser associada e a URL expirar. **[CONFIRMADO]**
- [ ] Recriar telas de usuários e perfil com estados vazios, confirmação de exclusão e toasts. **[CONFIRMADO]**
- [ ] Testar autorização direta pela API nos escopos `ALL`, `TEAM` e `OWN`. **[CONFIRMADO]**
- [ ] Validar política para reatribuir objetos de um usuário desativado. **[A VALIDAR]**

## Definição de pronto

- [ ] Requisitos `USERS-FR-001` a `USERS-FR-006` estão cobertos. **[INFERIDO]**
- [ ] Não existe elevação de privilégio por edição do próprio perfil. **[INFERIDO]**
- [ ] Auditoria registra ator e valores relevantes sem segredos. **[INFERIDO]**

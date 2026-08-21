# Convites e recuperação — Tarefas

- [ ] Recriar emissão de convite com validade de 72 horas; pronto quando hash, organização, papel/equipe e auditoria forem persistidos atomicamente. **[CONFIRMADO]**
- [ ] Recriar modelo e envio transacional de convite; pronto quando o link usar a URL pública configurada e nenhum segredo for logado. **[CONFIRMADO]**
- [ ] Recriar aceitação de convite; pronto quando expiração, consumo único, senha mínima e ativação forem testados. **[CONFIRMADO]**
- [ ] Recriar recuperação pública com resposta genérica e limite de tentativas; pronto quando e-mails inexistentes não puderem ser inferidos. **[CONFIRMADO]**
- [ ] Recriar reset administrativo e público de 60 minutos; pronto quando redefinir também revogar sessões existentes. **[CONFIRMADO]**
- [ ] Testar falha do provedor de e-mail e repetição segura da solicitação. **[INFERIDO]**
- [ ] Confirmar a experiência desejada para reenviar ou cancelar convites ainda válidos. **[A VALIDAR]**

## Definição de pronto

- [ ] Requisitos `ACCESS-FR-001` a `ACCESS-FR-005` estão cobertos. **[INFERIDO]**
- [ ] Links expirados e consumidos não alteram o banco. **[INFERIDO]**
- [ ] Testes, lint, typecheck e build estão verdes. **[INFERIDO]**

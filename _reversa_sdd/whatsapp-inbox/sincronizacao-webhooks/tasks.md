# Sincronização e webhooks — Tarefas

- [ ] Implementar `WHATSAPP_INBOX-4-FR-001`: Aceitar QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT, MESSAGES_UPDATE, MESSAGES_DELETE e SEND_MESSAGE. Pronto quando sucesso, falha e autorização estiverem cobertos. **[INFERIDO]**
- [ ] Implementar `WHATSAPP_INBOX-4-FR-002`: Responder ao webhook antes do processamento pesado. Pronto quando sucesso, falha e autorização estiverem cobertos. **[INFERIDO]**
- [ ] Implementar `WHATSAPP_INBOX-4-FR-003`: Deduplicar por evento e identificador remoto. Pronto quando sucesso, falha e autorização estiverem cobertos. **[INFERIDO]**
- [ ] Implementar `WHATSAPP_INBOX-4-FR-004`: Atualizar recibos, edições, exclusões e respostas citadas. Pronto quando sucesso, falha e autorização estiverem cobertos. **[INFERIDO]**
- [ ] Implementar `WHATSAPP_INBOX-4-FR-005`: Publicar apenas atualizações da conversa, mensagem ou instância afetada. Pronto quando sucesso, falha e autorização estiverem cobertos. **[INFERIDO]**

- [ ] Implementar idempotência e teste de redelivery para cada efeito externo. **[CONFIRMADO]**
- [ ] Implementar estado vazio, carregamento, erro e atualização em tempo real na interface. **[INFERIDO]**
- [ ] Testar timeout, reinício e concorrência sem duplicação. **[INFERIDO]**
- [ ] Executar typecheck, lint, testes e build. **[INFERIDO]**

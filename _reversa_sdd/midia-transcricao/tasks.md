# Mídia e transcrição — Tarefas de reconstrução

## Preparação

- [ ] Aplicar migrações e índices antes de habilitar produtores de job. **[CONFIRMADO]**
- [ ] Configurar credenciais somente no servidor e validar modo desabilitado. **[CONFIRMADO]**

## Implementação
- [ ] Reconstruir **Upload e download** conforme `upload-download/requirements.md`; pronto quando estados, falhas e retomadas passarem. **[INFERIDO]**
- [ ] Reconstruir **Mídia no WhatsApp** conforme `midia-whatsapp/requirements.md`; pronto quando estados, falhas e retomadas passarem. **[INFERIDO]**
- [ ] Reconstruir **Transcrever áudio** conforme `transcrever-audio/requirements.md`; pronto quando estados, falhas e retomadas passarem. **[INFERIDO]**
- [ ] Reconstruir **Retenção de mídia** conforme `retencao/requirements.md`; pronto quando estados, falhas e retomadas passarem. **[INFERIDO]**
- [ ] Recriar jobs determinísticos e guardas de estado antes de efeitos. **[CONFIRMADO]**
- [ ] Recriar eventos seletivos e consultas sob demanda. **[INFERIDO]**

## Validação

- [ ] Simular timeout, retry, redelivery, reinício e concorrência. **[INFERIDO]**
- [ ] Medir uso de CPU, memória, fila e banco sem trabalho vencendo. **[A VALIDAR]**
- [ ] Executar typecheck, lint, testes e build dos pacotes afetados. **[INFERIDO]**

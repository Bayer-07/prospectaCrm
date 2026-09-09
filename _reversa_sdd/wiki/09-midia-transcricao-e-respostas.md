# Mídia, transcrição e respostas rápidas

> Rotas: `/respostas-rapidas`, composer do `/inbox` e detalhes de contatos/oportunidades.
> Fonte de implementação: `apps/api/src/media`, `apps/api/src/quick-replies`, `apps/worker/src/audio-transcription.processor.ts`, `apps/web/src/components/WhatsappText.tsx`.

## Intenções atendidas

- Enviar imagem, documento ou áudio.
- Consultar ou remover anexo.
- Transcrever áudio recebido.
- Criar e usar resposta rápida.
- Inserir formatação de WhatsApp sem enviar automaticamente.

## Mídia

Arquivos são armazenados por chave em armazenamento compatível com S3/MinIO. A interface usa URLs assinadas ou rotas controladas; links permanentes não são a fonte de verdade. **[CONFIRMADO]**

No composer, selecione o tipo de mídia, anexe o arquivo e revise o texto antes de enviar. Falha no upload ou na URL temporária deve ser tratada como falha de mídia, não como mensagem enviada.

## Transcrição de áudio

O áudio recebido pode ser enviado para o serviço de transcrição assíncrona. O usuário continua usando a conversa enquanto o worker processa o arquivo. Quando concluída, a transcrição é vinculada à mensagem original; em erro, um diagnóstico é persistido. **[CONFIRMADO]**

## Respostas rápidas

Em **Respostas rápidas**:

1. crie um texto reutilizável e, opcionalmente, um anexo;
2. edite ou exclua o item conforme a permissão;
3. no composer, digite `/` para pesquisar atalhos;
4. selecione a resposta;
5. revise e edite o conteúdo;
6. envie manualmente.

Selecionar uma resposta rápida apenas preenche o rascunho. Não existe envio automático ao selecionar. Anexos continuam referenciando mídia protegida. **[CONFIRMADO]**

O caractere `/` é usado para respostas rápidas; automações ficam sob `@` quando esse recurso estiver disponível no composer. **[CONFIRMADO]**

## Formatação e acentos

O editor aceita formatação de WhatsApp com `*negrito*`, `_itálico_`, `~tachado~` e `` `código` ``. A composição de acentos no Linux deve preservar a digitação em dois tempos, como `´` + `a` → `á`; o componente não deve converter o texto a cada tecla. **[CONFIRMADO na revisão `c5a4997`]**

Se acentos não forem compostos: teste em outro campo, confirme o layout do teclado do sistema operacional e recarregue a aplicação. Se apenas o editor falhar, registrar o texto digitado, navegador, sistema e componente afetado.


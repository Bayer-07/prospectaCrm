# Inteligência artificial e base de conhecimento

> Rotas: `/integracoes/ai` e recursos de IA no Inbox.
> Fonte de implementação: `apps/api/src/ai`, `apps/worker/src/ai.processor.ts`, `ai-knowledge.processor.ts`, `openai-client.ts` e `apps/web/src/pages/Settings.tsx`.

## Intenções atendidas

- Configurar o provedor e modelo da IA.
- Definir instruções gerais da BZS.
- Gerar resumo de conversa.
- Pedir sugestão de resposta.
- Ativar pré-atendimento automático quando disponível.
- Enviar documento para a base de conhecimento.
- Diagnosticar documento ainda não indexado.

## Configurar IA

Em **Integrações → Inteligência artificial**:

1. Ative o recurso quando a organização puder usá-lo.
2. Escolha o modelo disponível.
3. Informe ou substitua a chave da OpenAI.
4. Escreva instruções gerais, como tom de voz, produtos, limites comerciais e contexto.
5. Salve.
6. Use **Testar geração** depois de salvar.

A chave é armazenada de forma protegida e não deve ser devolvida ao navegador em claro. O teste não substitui uma mensagem real nem envia automaticamente uma resposta. **[CONFIRMADO]**

## Recursos no atendimento

- **Resumo**: organiza o contexto de uma conversa.
- **Sugestão de resposta**: produz rascunho para revisão humana.
- **Pré-atendimento**: pode responder quando a conversa está elegível e ainda não foi assumida.

A IA não deve sobrescrever texto que o atendente já começou a digitar. Sugestões precisam ser aprovadas e enviadas pelo usuário. Assumir o atendimento cancela geração automática pendente. **[CONFIRMADO]**

## Base de conhecimento (RAG)

1. Abra **Integrações → Inteligência artificial → Base de conhecimento**.
2. Envie um documento permitido.
3. Aguarde o processamento.
4. Use o documento quando o status estiver pronto.

Estados principais:

- `INDEXING`: arquivo recebido e sendo processado;
- `READY`: fragmentos prontos para busca;
- `FAILED`: indexação falhou; a interface oferece tentativa novamente;
- `DELETING`: remoção em andamento.

Somente documentos `READY` participam da recuperação. A organização é a fronteira da base; um documento não pode vazar para outra organização. **[CONFIRMADO]**

## Limites da IA

- Não execute ferramenta ou alteração de CRM apenas porque a IA sugeriu.
- Não trate uma sugestão como decisão comercial.
- Não exponha prompts, chaves ou documentos privados a outro usuário.
- Falha de provedor, JSON inválido ou timeout deve virar erro/fallback persistido, não ação parcial.

Não há confirmação de interpretação visual geral nem de execução autônoma de ações externas pela IA atual. **[LACUNA para qualquer promessa além do que a interface mostra]**

## Diagnóstico

| Sintoma | Verificação |
|---|---|
| IA desabilitada | Recurso ativo, chave configurada e modelo disponível. |
| Sugestão não aparece | Conversa sem contexto, geração pendente, erro do provedor ou atendente assumiu. |
| Documento não é usado | Status ainda `INDEXING` ou `FAILED`. |
| Resposta automática não saiu | Conversa já atribuída, sessão interrompida, conexão ou consentimento. |

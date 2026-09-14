import { describe, expect, it } from 'vitest';
import { aiMessageImprovementDisposition, aiSuggestionDisposition } from './ai-suggestion.js';

describe('aplicação segura da sugestão de IA', () => {
  it('insere automaticamente somente quando o composer continua vazio e inalterado', () => {
    expect(aiSuggestionDisposition({ composerText: '', hasAttachment: false, requestedRevision: 4, currentRevision: 4 })).toBe('insert');
  });

  it.each([
    { composerText: 'O atendente começou a responder', hasAttachment: false, requestedRevision: 4, currentRevision: 5 },
    { composerText: '', hasAttachment: true, requestedRevision: 4, currentRevision: 4 },
    { composerText: '', hasAttachment: false, requestedRevision: 4, currentRevision: 5 },
  ])('oferece um botão sem sobrescrever o rascunho quando o estado mudou', (state) => {
    expect(aiSuggestionDisposition(state)).toBe('offer');
  });
});

describe('aplicação segura da melhoria de mensagem', () => {
  it('substitui o rascunho quando ele continua exatamente como estava na solicitação', () => {
    expect(aiMessageImprovementDisposition({
      composerText: 'oi td bem', requestedText: 'oi td bem', requestedRevision: 7, currentRevision: 7,
    })).toBe('replace');
  });

  it.each([
    { composerText: 'oi, tudo bem?', requestedText: 'oi td bem', requestedRevision: 7, currentRevision: 8 },
    { composerText: 'outro texto', requestedText: 'oi td bem', requestedRevision: 7, currentRevision: 7 },
  ])('não sobrescreve uma edição feita durante o processamento', (state) => {
    expect(aiMessageImprovementDisposition(state)).toBe('offer');
  });
});

import { describe, expect, it } from 'vitest';
import { aiSuggestionDisposition } from './ai-suggestion.js';

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

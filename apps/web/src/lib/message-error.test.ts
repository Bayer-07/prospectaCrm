import { describe, expect, it } from 'vitest';
import { describeMessageFailure } from './message-error';

describe('describeMessageFailure', () => {
  it('informa quando o provedor não registrou detalhes', () => {
    expect(describeMessageFailure()).toEqual({ summary: 'O provedor não informou o motivo da falha.' });
  });

  it('traduz falha de conexão e preserva o detalhe técnico', () => {
    expect(describeMessageFailure({ error: 'TypeError: fetch failed ECONNREFUSED' })).toEqual({
      summary: 'Não foi possível comunicar com a Evolution API.',
      detail: 'TypeError: fetch failed ECONNREFUSED',
    });
  });

  it('traduz timeout da Evolution', () => {
    expect(describeMessageFailure({ error: 'AbortError: request timed out' }).summary).toBe('A Evolution API demorou demais para responder.');
  });

  it('mantém erros específicos retornados pelo provedor', () => {
    expect(describeMessageFailure({ error: 'Evolution 400: recipient blocked' })).toEqual({ summary: 'Evolution 400: recipient blocked' });
  });

  it('explica a rejeição de mídia da Evolution', () => {
    expect(describeMessageFailure({ error: 'Evolution 400: Owned media must be a url or base64' }).summary).toBe(
      'A Evolution API rejeitou a mídia porque ela não foi reconhecida como uma URL válida ou arquivo base64.',
    );
  });
});

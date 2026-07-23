import { describe, expect, it } from 'vitest';
import { tokenizeWhatsappText } from './WhatsappText';

describe('tokenizeWhatsappText', () => {
  it('reconhece os quatro formatos usados pelo WhatsApp', () => {
    expect(tokenizeWhatsappText('*Negrito* _itálico_ ~tachado~ ```código```')).toEqual([
      { type: 'bold', value: 'Negrito', marker: '*' },
      { type: 'text', value: ' ' },
      { type: 'italic', value: 'itálico', marker: '_' },
      { type: 'text', value: ' ' },
      { type: 'strike', value: 'tachado', marker: '~' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'código', marker: '```' },
    ]);
  });

  it('reconhece código entre crases simples', () => {
    expect(tokenizeWhatsappText('Use `npm run build` aqui')).toEqual([
      { type: 'text', value: 'Use ' },
      { type: 'code', value: 'npm run build', marker: '`' },
      { type: 'text', value: ' aqui' },
    ]);
  });

  it('mantém marcadores incompletos como texto comum', () => {
    expect(tokenizeWhatsappText('*ainda digitando')).toEqual([{ type: 'text', value: '*ainda digitando' }]);
  });

  it('não formata conteúdo com espaço junto ao marcador', () => {
    expect(tokenizeWhatsappText('* texto *')).toEqual([{ type: 'text', value: '* texto *' }]);
  });
});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { firstWhatsappLink, linkifyWhatsappText, tokenizeWhatsappText, WhatsappText } from './WhatsappText';

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

describe('linkifyWhatsappText', () => {
  it('transforma links HTTP e HTTPS em partes clicáveis', () => {
    expect(linkifyWhatsappText('Veja https://www.bzs.com.br/sistemas/controle-agua-gas agora')).toEqual([
      { type: 'text', value: 'Veja ' },
      { type: 'link', value: 'https://www.bzs.com.br/sistemas/controle-agua-gas', href: 'https://www.bzs.com.br/sistemas/controle-agua-gas' },
      { type: 'text', value: ' agora' },
    ]);
  });

  it('aceita www e mantém a pontuação fora do link', () => {
    expect(linkifyWhatsappText('Acesse WWW.bzs.com.br.”')).toEqual([
      { type: 'text', value: 'Acesse ' },
      { type: 'link', value: 'WWW.bzs.com.br', href: 'https://WWW.bzs.com.br' },
      { type: 'text', value: '.”' },
    ]);
  });

  it('não transforma protocolos inseguros em links', () => {
    expect(linkifyWhatsappText('javascript:alert(1)')).toEqual([{ type: 'text', value: 'javascript:alert(1)' }]);
  });

  it('renderiza o link seguro e clicável mesmo dentro de uma formatação', () => {
    const html = renderToStaticMarkup(<WhatsappText text="*Veja https://www.bzs.com.br*" />);
    expect(html).toContain('<strong>Veja <a class="whatsapp-link" href="https://www.bzs.com.br" target="_blank" rel="noopener noreferrer">https://www.bzs.com.br</a></strong>');
  });

  it('não cria links dentro de trechos formatados como código', () => {
    const html = renderToStaticMarkup(<WhatsappText text="`https://www.bzs.com.br`" />);
    expect(html).not.toContain('<a');
    expect(html).toContain('<code>https://www.bzs.com.br</code>');
  });
});

describe('firstWhatsappLink', () => {
  it('encontra o primeiro link que pode ser exibido na mensagem', () => {
    expect(firstWhatsappLink('Veja *https://www.bzs.com.br/sistemas/controle-agua-gas*')).toBe(
      'https://www.bzs.com.br/sistemas/controle-agua-gas',
    );
  });

  it('ignora endereços marcados como código', () => {
    expect(firstWhatsappLink('`https://interno.exemplo.com`')).toBeUndefined();
  });
});

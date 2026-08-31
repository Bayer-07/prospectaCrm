import { describe, expect, it } from 'vitest';
import {
  chatbotHttpResponseHandle,
  chatbotHttpResponsePath,
  parseChatbotHttpBody,
  parseChatbotHttpHeaders,
} from './chatbot-http.js';

describe('requisição HTTP do chatbot', () => {
  it('seleciona a primeira rota correspondente pelo status ou por um campo do body', () => {
    const routes = [
      { id: 'not-found', label: 'Não encontrado', path: 'status', operator: 'equals', value: '404' },
      { id: 'adult', label: 'Maior de idade', path: 'body.idade', operator: 'greater_than', value: '17' },
    ];
    expect(chatbotHttpResponseHandle(routes, { status: 200, body: { nome: 'Gabriel', idade: 19 } })).toBe('adult');
    expect(chatbotHttpResponseHandle(routes, { status: 500, body: {} })).toBe('default');
  });

  it('permite uma rota específica para erros de rede', () => {
    const routes = [{ id: 'timeout', label: 'Tempo esgotado', path: 'error', operator: 'contains', value: 'timeout' }];
    expect(chatbotHttpResponseHandle(routes, { body: null, error: 'Request timeout' })).toBe('timeout');
  });

  it('lê objetos e arrays aninhados sem diferenciar maiúsculas', () => {
    expect(chatbotHttpResponsePath({ body: { Cliente: { nomes: ['Gabriel'] } } }, 'body.cliente.nomes.0')).toBe('Gabriel');
  });

  it('converte JSON e preserva texto simples no body', () => {
    expect(parseChatbotHttpBody('{"nome":"Gabriel","idade":19}')).toEqual({ nome: 'Gabriel', idade: 19 });
    expect(parseChatbotHttpBody('indisponível')).toBe('indisponível');
    expect(parseChatbotHttpBody('')).toBeNull();
  });

  it('aceita apenas cabeçalhos JSON seguros', () => {
    expect(parseChatbotHttpHeaders('{"Authorization":"Bearer token"}')).toEqual({ authorization: 'Bearer token' });
    expect(() => parseChatbotHttpHeaders('{"Host":"interno"}')).toThrow(/não é permitido/);
  });
});

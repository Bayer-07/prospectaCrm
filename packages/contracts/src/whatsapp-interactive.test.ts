import { describe, expect, it } from 'vitest';
import { extractWhatsappInteractive, whatsappInteractiveText } from './whatsapp-interactive.js';

describe('mensagens interativas do WhatsApp', () => {
  it('normaliza botões da mensagem oficial', () => {
    expect(extractWhatsappInteractive({
      message: {
        buttonsMessage: {
          contentText: 'Como podemos ajudar?',
          footerText: 'Escolha uma opção',
          buttons: [
            { buttonId: 'sales', buttonText: { displayText: 'Comercial' }, type: 1 },
            { buttonId: 'support', buttonText: { displayText: 'Suporte' }, type: 1 },
          ],
        },
      },
    })).toEqual({
      kind: 'buttons',
      header: null,
      body: 'Como podemos ajudar?',
      footer: 'Escolha uma opção',
      buttons: [
        { id: 'sales', text: 'Comercial' },
        { id: 'support', text: 'Suporte' },
      ],
      selection: null,
    });
  });

  it('normaliza quick replies do native flow da API Oficial', () => {
    expect(extractWhatsappInteractive({
      interactiveMessage: {
        body: { text: 'Selecione o setor' },
        nativeFlowMessage: {
          buttons: [{
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ id: 'finance', display_text: 'Financeiro' }),
          }],
        },
      },
    })).toMatchObject({
      kind: 'interactive',
      body: 'Selecione o setor',
      buttons: [{ id: 'finance', text: 'Financeiro' }],
    });
  });

  it('transforma respostas de botão em texto legível', () => {
    expect(whatsappInteractiveText({
      message: {
        buttonsResponseMessage: {
          selectedButtonId: 'sales',
          selectedDisplayText: 'Comercial',
        },
      },
    })).toBe('Comercial');
  });

  it('normaliza linhas de lista como opções clicáveis', () => {
    expect(extractWhatsappInteractive({
      interactiveMessage: {
        body: { text: 'Escolha uma opção' },
        nativeFlowMessage: {
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              sections: [{ rows: [{ id: 'first', title: 'Primeira opção' }] }],
            }),
          }],
        },
      },
    })).toMatchObject({
      kind: 'list',
      buttons: [{ id: 'first', text: 'Primeira opção' }],
    });
  });
});

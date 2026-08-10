import { describe, expect, it } from 'vitest';
import { composerCommandSearch, detectComposerCommand } from './composer-command';

const enabled = { canReply: true, editing: false, hasFile: false };

describe('atalhos do composer', () => {
  it('abre respostas rápidas com / e automações com @', () => {
    expect(detectComposerCommand('/apresentacao', enabled)).toBe('quick-reply');
    expect(detectComposerCommand('@cadencia', enabled)).toBe('automation');
  });

  it('não abre comandos durante edição ou em mensagens com várias linhas', () => {
    expect(detectComposerCommand('/teste', { ...enabled, editing: true })).toBeNull();
    expect(detectComposerCommand('/teste\ncontinuação', enabled)).toBeNull();
  });

  it('permite trocar um anexo por resposta rápida, mas não iniciar automação com arquivo', () => {
    expect(detectComposerCommand('/com-anexo', { ...enabled, hasFile: true })).toBe('quick-reply');
    expect(detectComposerCommand('@automacao', { ...enabled, hasFile: true })).toBeNull();
  });

  it('extrai a busca sem o caractere do comando', () => {
    expect(composerCommandSearch('/ Proposta ', '/')).toBe('proposta');
    expect(composerCommandSearch('@ Boas-vindas ', '@')).toBe('boas-vindas');
  });
});

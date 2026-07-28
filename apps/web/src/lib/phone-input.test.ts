import { describe, expect, it } from 'vitest';
import { brazilNationalPhoneDigits, formatBrazilPhoneInput, toBrazilE164Phone } from './phone-input';

describe('campo de telefone brasileiro', () => {
  it('formata somente os números digitados', () => {
    expect(formatBrazilPhoneInput('45999225389')).toBe('(45) 99922-5389');
    expect(formatBrazilPhoneInput('5437022557')).toBe('(54) 3702-2557');
  });

  it('aceita valores já salvos ou colados com o código +55', () => {
    expect(formatBrazilPhoneInput('+5554999225389')).toBe('(54) 99922-5389');
    expect(brazilNationalPhoneDigits('55 (45) 99922-5389')).toBe('45999225389');
  });

  it('converte a máscara para E.164 antes de enviar à API', () => {
    expect(toBrazilE164Phone('(45) 99922-5389')).toBe('+5545999225389');
    expect(toBrazilE164Phone('')).toBeUndefined();
  });
});

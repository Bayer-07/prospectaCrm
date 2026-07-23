import { describe, expect, it } from 'vitest';
import { formatPhone } from './api';

describe('formatPhone', () => {
  it('formata celular brasileiro armazenado em E.164', () => {
    expect(formatPhone('+5545999225389')).toBe('(45) 99922-5389');
  });

  it('formata telefone fixo brasileiro', () => {
    expect(formatPhone('+554532345678')).toBe('(45) 3234-5678');
  });

  it('preserva números fora dos formatos brasileiros reconhecidos', () => {
    expect(formatPhone('+12025550123')).toBe('+12025550123');
  });
});

import { describe, expect, it } from 'vitest';
import { date, formatPhone, initials } from './api';

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

describe('date and initials', () => {
  it('formata somente a data, sem vírgula sobrando', () => {
    expect(date('2026-11-26T15:10:00')).toBe('26/11/2026');
    expect(date(null)).toBe('—');
  });

  it('ignora símbolos ao montar iniciais', () => {
    expect(initials('Ferro & Cia')).toBe('FC');
    expect(initials('Ana Ribeiro')).toBe('AR');
    expect(initials('')).toBe('');
  });
});

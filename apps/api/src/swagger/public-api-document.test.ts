import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { filterPublicApiDocument } from './public-api-document.js';

const operation = { responses: { 200: { description: 'OK' } } };

describe('filterPublicApiDocument', () => {
  it('mantém somente os recursos úteis para integrações externas', () => {
    const document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {
        '/api/v1/companies': { get: operation, post: operation },
        '/api/v1/contacts/{id}': { get: operation, patch: operation },
        '/api/v1/opportunities/{id}': { delete: operation },
        '/api/v1/tasks/{id}/complete': { patch: operation },
        '/api/v1/tags': { get: operation },
        '/api/v1/custom-fields/{id}': { patch: operation },
        '/api/v1/segments': { post: operation },
        '/api/v1/dashboard': { get: operation },
        '/api/v1/conversations': { get: operation },
        '/api/v1/opportunities/{id}/stage': { patch: operation },
        '/health': { get: operation },
      },
    } as OpenAPIObject;

    const result = filterPublicApiDocument(document);

    expect(Object.keys(result.paths)).toEqual([
      '/api/v1/companies',
      '/api/v1/contacts/{id}',
      '/api/v1/opportunities/{id}',
      '/api/v1/tasks/{id}/complete',
      '/api/v1/tags',
      '/api/v1/custom-fields/{id}',
      '/api/v1/segments',
    ]);
    expect(result.paths['/api/v1/companies']?.get?.tags).toEqual(['Empresas']);
    expect(result.paths['/api/v1/companies']?.get?.security).toEqual([{ 'api-key': [] }]);
  });

  it('não altera o documento original', () => {
    const document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: { '/api/v1/companies': { get: operation } },
    } as OpenAPIObject;

    const result = filterPublicApiDocument(document);

    expect(result).not.toBe(document);
    expect(result.paths).not.toBe(document.paths);
    expect(document.paths['/api/v1/companies']?.get?.tags).toBeUndefined();
  });
});

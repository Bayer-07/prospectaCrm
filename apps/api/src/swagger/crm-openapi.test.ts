import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CrmController } from '../crm/crm.controller.js';
import {
  CompanyCreateRequest,
  CompanyResponse,
  ContactUpdateRequest,
} from './crm-openapi.js';

const MODEL_PROPERTIES = 'swagger/apiModelPropertiesArray';
const MODEL_PROPERTY = 'swagger/apiModelProperties';
const OPERATION = 'swagger/apiOperation';
const PARAMETERS = 'swagger/apiParameters';
const RESPONSES = 'swagger/apiResponse';

type SwaggerParameter = {
  name?: string;
  in?: string;
  type?: Function;
  required?: boolean;
  description?: string;
};

const publicOperations = [
  'listCompanies',
  'company',
  'createCompany',
  'updateCompany',
  'archiveCompany',
  'listContacts',
  'contact',
  'createContact',
  'updateContact',
  'archiveContact',
  'createOpportunity',
  'opportunities',
  'opportunity',
  'updateOpportunity',
  'archiveOpportunity',
  'tasks',
  'createTask',
  'completeTask',
  'updateTask',
  'cancelTask',
  'tags',
  'createTag',
  'updateTag',
  'deleteTag',
  'customFields',
  'createCustomField',
  'updateCustomField',
  'deleteCustomField',
  'segments',
  'createSegment',
  'updateSegment',
  'deleteSegment',
] as const;

describe('documentação OpenAPI do CRM', () => {
  it('descreve todos os endpoints públicos com resumo, descrição e respostas', () => {
    for (const method of publicOperations) {
      const handler = CrmController.prototype[method];
      const operation = Reflect.getMetadata(OPERATION, handler) as { summary?: string; description?: string };
      const responses = Reflect.getMetadata(RESPONSES, handler) as Record<string, unknown>;

      expect(operation.summary, `${method} sem resumo`).toBeTruthy();
      expect(operation.description, `${method} sem descrição`).toBeTruthy();
      expect(Object.keys(responses || {}).length, `${method} sem respostas`).toBeGreaterThan(0);
    }
  });

  it('documenta todos os atributos de criação de empresa', () => {
    const properties = (Reflect.getMetadata(MODEL_PROPERTIES, CompanyCreateRequest.prototype) as string[])
      .map((property) => property.replace(/^:/, ''));

    expect(properties).toEqual([
      'name',
      'legalName',
      'cnpj',
      'domain',
      'linkedinUrl',
      'sector',
      'size',
      'phone',
      'address',
      'ownerId',
      'teamId',
      'externalId',
      'customFields',
    ]);

    const name = Reflect.getMetadata(MODEL_PROPERTY, CompanyCreateRequest.prototype, 'name') as SwaggerParameter;
    const cnpj = Reflect.getMetadata(MODEL_PROPERTY, CompanyCreateRequest.prototype, 'cnpj') as SwaggerParameter;
    expect(name).toMatchObject({ description: 'Nome fantasia da empresa.', minLength: 2 });
    expect(cnpj.description).toContain('CNPJ válido');
  });

  it('mantém campos de atualização opcionais e tipos de saída precisos', () => {
    const companyId = Reflect.getMetadata(MODEL_PROPERTY, ContactUpdateRequest.prototype, 'companyId') as SwaggerParameter & {
      nullable?: boolean;
      format?: string;
    };
    const cnpj = Reflect.getMetadata(MODEL_PROPERTY, CompanyResponse.prototype, 'cnpj') as SwaggerParameter & {
      nullable?: boolean;
    };
    const phone = Reflect.getMetadata(MODEL_PROPERTY, CompanyResponse.prototype, 'phone') as SwaggerParameter & {
      nullable?: boolean;
    };

    expect(companyId).toMatchObject({ type: String, required: false, nullable: true, format: 'uuid' });
    expect(cnpj).toMatchObject({ type: String, required: false, nullable: true });
    expect(phone).toMatchObject({ type: String, required: false, nullable: true });
  });

  it('expõe os filtros disponíveis na listagem de contatos', () => {
    const parameters = Reflect.getMetadata(
      PARAMETERS,
      CrmController.prototype.listContacts,
    ) as SwaggerParameter[];

    expect(parameters.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name)).toEqual([
      'cursor',
      'limit',
      'search',
      'consent',
      'emailOnly',
      'ownerId',
      'teamId',
      'tagId',
      'company',
      'hasPhone',
      'hasEmail',
    ]);
  });

  it('documenta o corpo e a chave de idempotência nas criações sensíveis', () => {
    const parameters = Reflect.getMetadata(
      PARAMETERS,
      CrmController.prototype.createCompany,
    ) as SwaggerParameter[];

    expect(parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
      expect.objectContaining({ type: CompanyCreateRequest, in: 'body', required: true }),
    ]));
  });
});

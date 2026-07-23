import type { OpenAPIObject } from '@nestjs/swagger';

type PathItem = OpenAPIObject['paths'][string];

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

const PUBLIC_RESOURCES = [
  {
    tag: 'Empresas',
    description: 'Cadastro e manutenção das empresas do CRM.',
    pattern: /^\/api\/v1\/companies(?:\/\{id\})?$/,
  },
  {
    tag: 'Contatos',
    description: 'Cadastro e manutenção dos contatos do CRM.',
    pattern: /^\/api\/v1\/contacts(?:\/\{id\})?$/,
  },
  {
    tag: 'Oportunidades',
    description: 'Criação, consulta e atualização de oportunidades comerciais.',
    pattern: /^\/api\/v1\/opportunities(?:\/\{id\})?$/,
  },
  {
    tag: 'Tarefas',
    description: 'Gestão de tarefas e conclusão de atividades.',
    pattern: /^\/api\/v1\/tasks(?:\/\{id\}(?:\/complete)?)?$/,
  },
  {
    tag: 'Tags',
    description: 'Tags utilizadas para classificar registros comerciais.',
    pattern: /^\/api\/v1\/tags(?:\/\{id\})?$/,
  },
  {
    tag: 'Campos personalizados',
    description: 'Definição dos campos personalizados disponíveis no CRM.',
    pattern: /^\/api\/v1\/custom-fields(?:\/\{id\})?$/,
  },
  {
    tag: 'Segmentos',
    description: 'Listas e segmentos salvos para organização de contatos.',
    pattern: /^\/api\/v1\/segments(?:\/\{id\})?$/,
  },
] as const;

export function filterPublicApiDocument(document: OpenAPIObject): OpenAPIObject {
  const paths: Record<string, PathItem> = {};

  for (const [path, pathItem] of Object.entries(document.paths)) {
    const resource = PUBLIC_RESOURCES.find((candidate) => candidate.pattern.test(path));
    if (!resource) continue;

    paths[path] = Object.fromEntries(Object.entries(pathItem).map(([key, value]) => [
      key,
      HTTP_METHODS.has(key) && value
        ? { ...value, tags: [resource.tag], security: [{ 'api-key': [] }] }
        : value,
    ])) as PathItem;
  }

  return {
    ...document,
    paths,
    tags: PUBLIC_RESOURCES.map(({ tag, description }) => ({ name: tag, description })),
  };
}

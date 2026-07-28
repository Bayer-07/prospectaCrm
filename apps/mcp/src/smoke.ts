import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const token = process.env.BZS_ONE_MCP_TOKEN;
const url = process.env.MCP_SMOKE_URL || process.env.VITE_MCP_URL || 'http://localhost:3100/mcp';
if (!token) throw new Error('Defina BZS_ONE_MCP_TOKEN antes de executar o teste MCP');
const companyCnpj = process.env.MCP_SMOKE_COMPANY_CNPJ?.replace(/\D/g, '');
const companyName = process.env.MCP_SMOKE_COMPANY_NAME?.trim();

function resultOf<T>(response: Awaited<ReturnType<Client['callTool']>>) {
  if (response.isError) {
    const message = response.content.find((item) => item.type === 'text');
    throw new Error(message?.type === 'text' ? message.text : 'Uma ferramenta MCP retornou erro');
  }
  return (response.structuredContent as { result?: T } | undefined)?.result;
}

const client = new Client({ name: 'bzs-one-smoke-test', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(url), {
  authProvider: { token: async () => token },
});

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const destructive = tools.filter((tool) =>
    tool.annotations?.destructiveHint !== false
    || /(excluir|apagar|arquivar|cancelar|delete|remove)/i.test(tool.name));
  if (destructive.length) {
    throw new Error(`Ferramentas destrutivas encontradas: ${destructive.map((tool) => tool.name).join(', ')}`);
  }

  if (companyCnpj) {
    if (!companyName) throw new Error('Defina MCP_SMOKE_COMPANY_NAME para testar a criação de empresa');
    const before = resultOf<{ data?: Array<{ id: string; name: string; cnpj?: string | null }> }>(
      await client.callTool({
        name: 'listar_empresas',
        arguments: { search: companyCnpj, limit: 100 },
      }),
    );
    let company = before?.data?.find((item) => item.cnpj?.replace(/\D/g, '') === companyCnpj);
    let created = false;
    if (!company) {
      const creation = resultOf<{ data?: { id: string; name: string; cnpj?: string | null } }>(
        await client.callTool({
          name: 'criar_empresa',
          arguments: {
            name: companyName,
            legalName: companyName,
            cnpj: companyCnpj,
            externalId: `mcp-validation-cnpj-${companyCnpj}`,
            idempotencyKey: `mcp-validation-cnpj-${companyCnpj}`,
          },
        }),
      );
      company = creation?.data;
      created = true;
    }
    if (!company?.id) throw new Error('O MCP não retornou o ID da empresa criada ou localizada');

    const readBack = resultOf<{ data?: { id: string; name: string; cnpj?: string | null } }>(
      await client.callTool({
        name: 'obter_empresa',
        arguments: { id: company.id },
      }),
    )?.data;
    if (!readBack || readBack.cnpj?.replace(/\D/g, '') !== companyCnpj) {
      throw new Error('A empresa não pôde ser relida pelo MCP após a criação');
    }
    console.log(JSON.stringify({
      ok: true,
      endpoint: url,
      availableTools: tools.length,
      created,
      company: {
        id: readBack.id,
        name: readBack.name,
        cnpj: readBack.cnpj,
      },
    }, null, 2));
  } else {
    const response = await client.callTool({
      name: 'listar_empresas',
      arguments: { limit: 20 },
    });
    const companies = resultOf<{ data?: Array<{ id: string; name: string }> }>(response)?.data ?? [];
    console.log(JSON.stringify({
      ok: true,
      endpoint: url,
      availableTools: tools.length,
      companiesRead: companies.length,
      companies: companies.map(({ id, name }) => ({ id, name })),
    }, null, 2));
  }
} finally {
  await client.close();
}

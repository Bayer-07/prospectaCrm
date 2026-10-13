# BZS One

Plugin do BZS One para consultar e atualizar o CRM por MCP, incluindo equipes,
filas, campanhas e chatbots de regras ou de IA.

## Conexão

O plugin usa o servidor remoto:

`https://bzsone.tail9c7481.ts.net/mcp`

No ChatGPT Web, a conexão usa OAuth 2.1 com PKCE: o usuário autoriza o acesso
em uma tela do BZS One e o MCP emite um token de curta duração vinculado à
sessão do usuário. Nenhuma senha ou chave é armazenada neste pacote.

Em instalações legadas do Codex, a configuração `.mcp.json` continua aceitando
`BZS_ONE_MCP_API_KEY` para manter compatibilidade com a conexão anterior.

## Chatbots

O workflow incluído orienta o agente a consultar o catálogo de nós e os
metadados antes de criar ou editar fluxos. Alterações de chatbot são versionadas;
publicação, pausa, ativação e arquivamento são operações explícitas.

# BZS One

Plugin do BZS One para consultar e atualizar o CRM por MCP, incluindo equipes,
filas, campanhas e chatbots de regras ou de IA.

## Conexão

O plugin usa o servidor remoto:

`https://bzsone.tail9c7481.ts.net/mcp`

A credencial é configurada pelo host do plugin e não é armazenada neste pacote.
Em instalações legadas do Codex, defina a variável de ambiente
`BZS_ONE_MCP_API_KEY` com uma chave MCP válida antes de iniciar o cliente.

## Chatbots

O workflow incluído orienta o agente a consultar o catálogo de nós e os
metadados antes de criar ou editar fluxos. Alterações de chatbot são versionadas;
publicação, pausa, ativação e arquivamento são operações explícitas.

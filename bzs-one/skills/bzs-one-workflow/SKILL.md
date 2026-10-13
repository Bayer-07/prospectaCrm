---
name: bzs-one-workflow
description: Use quando o usuário quiser consultar ou atualizar dados do BZS One, especialmente equipes, filas, campanhas e chatbots de regras ou IA.
---

# Workflow do BZS One

Use as ferramentas MCP do BZS One para consultar o CRM e executar alterações
solicitadas pelo usuário.

## Consultas e referências

- Consulte primeiro as conexões, equipes ou filas disponíveis quando a operação
  depender de uma delas.
- Nunca invente IDs. Use os identificadores retornados pelo servidor e confirme
  a conexão, o chatbot e a equipe/fila antes de uma alteração.
- Para chatbots, consulte `obter_metadados_chatbots` e `listar_nos_chatbot`
  antes de montar ou modificar um fluxo. O catálogo é a referência dos tipos de
  nós, campos aceitos e conexões possíveis.
- Reutilize o formato de nós já existente no chatbot quando estiver editando um
  fluxo, preservando configurações que não foram solicitadas para alteração.

## Criação e edição de chatbots

- Diferencie chatbot de regras e chatbot de IA conforme o tipo suportado pelo
  servidor; não converta um tipo sem solicitação explícita.
- Ao criar um chatbot, valide a conexão de destino e todas as referências de
  equipe, fila, campanha ou variável antes de salvar.
- Para fluxos com decisões, configure todas as entradas e o caminho de fallback.
  Mensagens de validação devem orientar o próximo passo sem repetir a mesma
  mensagem desnecessariamente.
- Em perguntas binárias, normalize respostas equivalentes (por exemplo,
  variações de "sim" e "não") no próprio nó de decisão quando o catálogo
  permitir, sem instruir o cliente a responder com uma forma específica.
- Use `editar_chatbot` para alterações incrementais e evite substituir o fluxo
  inteiro quando uma edição pontual for suficiente.

## Publicação e estado

- Salvar uma alteração não significa publicá-la. Depois de editar, publique
  somente quando o usuário solicitar ou quando isso estiver claramente implícito
  na tarefa.
- Depois de publicar, confirme o status e a versão retornados pelo servidor.
- Pausar, ativar e excluir são ações distintas. A exclusão do BZS One é lógica:
  interrompe sessões ativas e arquiva o chatbot, preservando versões e histórico.
  Só execute quando o alvo estiver claro.

## Segurança operacional

- Não revele, registre ou inclua chaves MCP em mensagens, arquivos, logs,
  exemplos ou commits.
- Para operações destrutivas ou que alterem atendimento em produção, confirme o
  nome da conexão e do chatbot se houver qualquer ambiguidade.
- Se uma ferramenta ou campo não estiver disponível no catálogo retornado pelo
  servidor, informe a limitação em vez de inventar um payload.

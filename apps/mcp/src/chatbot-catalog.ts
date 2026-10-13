export const chatbotNodeCatalog = [
  {
    type: 'trigger',
    label: 'Mensagem recebida',
    behavior: 'Entrada do fluxo. O chatbot inicia quando a mensagem satisfaz a regra configurada; deixe value vazio para aceitar qualquer mensagem.',
    data: 'operator: contains | equals | starts_with | ends_with; value: palavras ou frases separadas por vírgula, ponto e vírgula ou quebra de linha.',
    connections: 'Exatamente uma saída.',
  },
  {
    type: 'message',
    label: 'Enviar mensagem',
    behavior: 'Envia uma resposta automática e segue imediatamente para o próximo nó.',
    data: 'text: mensagem obrigatória. Suporta {{saudacao}}, {{nome}}, {{telefone}}, {{email}}, {{empresa}}, {{cargo}}, {{mensagem}} e variáveis capturadas por question ou http_request.',
    connections: 'Exatamente uma saída.',
  },
  {
    type: 'question',
    label: 'Fazer pergunta',
    behavior: 'Envia uma pergunta e pausa o fluxo até chegar uma nova mensagem do contato.',
    data: 'text: pergunta obrigatória; responseVariable: nome opcional para salvar a resposta, usando letras, números e underscore, sem variáveis reservadas.',
    connections: 'Exatamente uma saída. Também é um limite válido para ciclos.',
  },
  {
    type: 'wait',
    label: 'Aguardar',
    behavior: 'Pausa o fluxo pelo número de segundos e o worker o retoma por fila assíncrona.',
    data: 'seconds: inteiro entre 1 e 31.536.000.',
    connections: 'Exatamente uma saída. Também é um limite válido para ciclos.',
  },
  {
    type: 'http_request',
    label: 'Requisição HTTP',
    behavior: 'Chama uma URL HTTP/HTTPS pública, salva o body retornado em uma variável e escolhe a rota correspondente à resposta.',
    data: 'method: GET | POST | PUT | PATCH | DELETE; url: pública, sem credenciais; headers: objeto JSON em texto; body: até 256 KB para métodos diferentes de GET; variableName: variável temporária; timeoutSeconds: 1 a 60; responseRoutes: 1 a 8 rotas.',
    connections: 'Uma saída para cada responseRoutes.id e uma saída default obrigatória. Rotas usam path status, error ou body.campo e operators equals, not_equals, contains, exists, not_exists, greater_than, less_than ou between.',
  },
  {
    type: 'ai_conversation',
    label: 'Atendimento por IA',
    behavior: 'Agenda uma resposta de pré-atendimento por IA, pausa o fluxo enquanto ela é gerada e depois continua para a transferência humana.',
    data: 'objective: obrigatório até 2.000 caracteres; instructions: até 5.000; transferCriteria: até 3.000; maxInteractions: 1 a 20; minimumConfidence: 0 a 100; responseDelayMinSeconds/responseDelayMaxSeconds: 0 a 300; fallbackMessage: até 1.000.',
    connections: 'A próxima saída deve ser handoff ou assign_queue seguido diretamente de handoff. Exige responseProvider OPENAI e é um limite válido para ciclos.',
  },
  {
    type: 'condition',
    label: 'Condição',
    behavior: 'Compara a última mensagem ou resposta capturada com a regra configurada e escolhe o ramo correspondente.',
    data: 'operator: contains | equals | starts_with | ends_with; value: valor esperado.',
    connections: 'Exatamente duas saídas, com sourceHandle true e false.',
  },
  {
    type: 'add_tag',
    label: 'Adicionar tag',
    behavior: 'Adiciona a tag ao contato e segue para o próximo nó.',
    data: 'tagId: UUID de uma tag existente.',
    connections: 'Exatamente uma saída.',
  },
  {
    type: 'assign_queue',
    label: 'Atribuir fila',
    behavior: 'Define a equipe/fila da conversa e segue para o próximo nó.',
    data: 'teamId: UUID de uma equipe existente.',
    connections: 'Exatamente uma saída.',
  },
  {
    type: 'handoff',
    label: 'Transferir',
    behavior: 'Interrompe o bot e entrega o ticket para atendimento humano na fila atual.',
    data: 'Nenhum campo obrigatório.',
    connections: 'Nó final; não pode ter saída.',
  },
  {
    type: 'close',
    label: 'Encerrar ticket',
    behavior: 'Finaliza o fluxo e fecha a conversa.',
    data: 'Nenhum campo obrigatório.',
    connections: 'Nó final; não pode ter saída.',
  },
  {
    type: 'end',
    label: 'Finalizar bot',
    behavior: 'Finaliza o fluxo do chatbot, mantendo a conversa disponível para atendimento.',
    data: 'Nenhum campo obrigatório.',
    connections: 'Nó final; não pode ter saída.',
  },
] as const;

export const chatbotGraphRules = [
  'O grafo aceita no máximo 100 nós e todas as arestas devem apontar para nós existentes.',
  'Ao publicar, deve haver exatamente um trigger e pelo menos um nó final: handoff, close ou end.',
  'Todos os nós precisam ser alcançáveis a partir do trigger.',
  'Todo ciclo precisa passar por question, wait ou ai_conversation; ciclos só com ações automáticas são rejeitados.',
  'O rascunho pode ser salvo antes da validação completa, mas a publicação executa todas as validações de nós, referências de filas e provedor de IA.',
] as const;

export const chatbotResponseProviders = [
  {
    key: 'RULES',
    label: 'Regras',
    behavior: 'Usa comparação textual normalizada para trigger e condition e suporta todos os nós, exceto ai_conversation.',
  },
  {
    key: 'OPENAI',
    label: 'OpenAI',
    behavior: 'Mantém as regras e habilita ai_conversation; só funciona quando a organização tem o assistente de IA e uma credencial configurada.',
  },
] as const;

export const chatbotCatalog = {
  responseProviders: chatbotResponseProviders,
  nodeTypes: chatbotNodeCatalog,
  graphRules: chatbotGraphRules,
} as const;

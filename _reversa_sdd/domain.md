# Domínio e regras de negócio — BZS One

> Interpretação retroativa do sistema existente em 2026-08-21.  
> Legenda: 🟢 **CONFIRMADO** pelo código/testes; 🟡 **INFERIDO** a partir de estrutura, histórico ou combinação de fluxos; 🔴 **LACUNA** não comprovada pelo repositório.

## 1. Contexto do domínio

O BZS One é uma plataforma interna, de organização única, que reúne CRM comercial, atendimento compartilhado pelo WhatsApp, campanhas, automações, chatbots, tarefas, follow-ups e assistência por IA. O núcleo do domínio é a relação entre uma pessoa/empresa, a oportunidade comercial e o histórico de interações. 🟢

Embora praticamente todas as entidades tenham `organizationId`, o produto atual não expõe autoatendimento multiempresa nem isolamento SaaS configurável. Essa chave funciona como fronteira de segurança e prepara o modelo para eventual expansão. 🟢

## 2. Glossário ubíquo

| Termo | Significado no BZS One | Confiança |
|---|---|---|
| Organização | Unidade lógica máxima de isolamento dos dados. Usuários, equipes, CRM, canais e configurações pertencem a ela. | 🟢 |
| Equipe | Agrupamento de usuários e fronteira possível do escopo `TEAM`; também controla acesso a conexões WhatsApp e filas sem responsável. | 🟢 |
| Papel | Conjunto customizável de permissões `recurso:ação:escopo`; os papéis de sistema iniciais são Administrador, Gestor, SDR e Vendedor. | 🟢 |
| Responsável / carteira | Usuário que possui um registro comercial, tarefa, conversa ou follow-up. Não é uma entidade autônoma: é representado por `ownerId`, `assigneeId` ou `responsibleId`. | 🟢 |
| Empresa | Conta comercial identificável por nome, CNPJ e/ou domínio; pode ter contatos, oportunidades, tags, proprietário, equipe, logo e LinkedIn. | 🟢 |
| Contato | Pessoa prospectada ou atendida, com telefone/e-mail normalizados, empresa principal opcional, consentimento e bloqueios. | 🟢 |
| Oportunidade | Negócio em um funil e etapa; liga contatos e empresa, guarda valor, probabilidade, origem, proposta e estado aberto/ganho/perdido. | 🟢 |
| Funil / etapa | Ordenação configurável usada pelo Kanban. A etapa define probabilidade e pode representar ganho ou perda. | 🟢 |
| Tarefa | Compromisso de agenda atribuído a usuário, com início/fim, prioridade e estado. Pode representar um follow-up automático. | 🟢 |
| Conexão / instância | Número WhatsApp gerenciado pela Evolution API, com credencial criptografada, estado independente e associação a equipes. | 🟢 |
| Conversa | Canal persistente entre um contato e uma instância. Também é o contêiner do histórico integral de mensagens e eventos. | 🟢 |
| Atendimento / ticket | Intervalo operacional da conversa entre a abertura por mensagem/início manual e o encerramento. Uma conversa pode ter vários atendimentos ao longo do tempo. | 🟢 |
| Mensagem | Registro de entrada ou saída, texto/mídia/metadados, estado de entrega, resposta, edição, reação e vínculo opcional com campanha, chatbot ou follow-up. | 🟢 |
| Evento interno | Log visível na conversa sobre ações do sistema/operador; não é enviado ao cliente. | 🟢 |
| Consentimento | Estado de autorização de WhatsApp: desconhecido, concedido ou revogado, com origem/evidência quando disponíveis. | 🟢 |
| Supressão global | Bloqueio de telefone/e-mail que interrompe campanhas, automações e follow-ups promocionais correspondentes. | 🟢 |
| Bloqueio de campanhas | Preferência do contato que o exclui de campanhas de WhatsApp e e-mail, mas não impede atendimento individual. | 🟢 |
| Campanha | Disparo em massa por WhatsApp ou e-mail, com audiência, sequência, agenda, limites, métricas e destinatários individualizados. | 🟢 |
| Destinatário de campanha | Unidade idempotente de entrega por contato, com conteúdo personalizado e motivo de exclusão/falha. | 🟢 |
| Automação / workflow | Grafo versionado de gatilhos, condições, esperas e ações que executa sobre um contato. | 🟢 |
| Inscrição | Execução de uma versão imutável de automação para um contato específico. | 🟢 |
| Chatbot | Grafo conversacional versionado ligado a uma instância; pode usar regras ou IA como motor de resposta. | 🟢 |
| Sessão de chatbot | Execução conversacional de uma versão publicada para uma conversa, preservando contexto, nó atual e espera. | 🟢 |
| Follow-up automático | Ação futura vinculada simultaneamente a conversa e tarefa; envia sequência ou inicia automação. | 🟢 |
| Geração de IA | Trabalho assíncrono de resumo, sugestão, resposta de chatbot ou teste de configuração. | 🟢 |
| Proposta da IA | Alteração sugerida para dados comerciais, que exige decisão humana e auditoria. | 🟢 |
| Documento de conhecimento | Arquivo indexado em fragmentos e embeddings para recuperação de contexto (RAG). | 🟢 |
| Notificação | Aviso interno por usuário, entregue pela API e por tempo real, com leitura individual. | 🟢 |
| Auditoria | Registro imutável de ação, entidade, autor e estados anterior/posterior quando disponíveis. | 🟢 |

## 3. Invariantes transversais

### 3.1 Organização, identidade e auditoria

1. Toda consulta de negócio autenticada deve permanecer limitada ao `organizationId` da sessão ou chave de API. 🟢
2. Sessões só são válidas para usuários `ACTIVE`, antes do vencimento e enquanto o registro persistido continuar compatível com o JWT. 🟢
3. Requisições mutáveis autenticadas por cookie exigem CSRF; bearer tokens não dependem do cookie CSRF. 🟢
4. Permissão de interface não substitui autorização da API. O `AuthGuard` valida recurso/ação e os serviços aplicam o escopo de dados. 🟢
5. Ações comerciais sensíveis criam `AuditLog` ou evento interno; a cobertura não é uniforme para toda mutação auxiliar. 🟡
6. Exclusão de registros comerciais é predominantemente lógica (`archivedAt`); mensagens removidas pelo WhatsApp preservam o conteúdo interno e recebem marca de apagada. 🟢

### 3.2 Empresas, contatos e oportunidades

1. Empresa ativa não deve duplicar CNPJ ou domínio normalizado dentro da organização; a mesclagem é o mecanismo para consolidar duplicatas existentes. 🟢
2. Contato ativo não deve duplicar telefone equivalente ou e-mail normalizado dentro da organização. A equivalência brasileira considera variações com o nono dígito. 🟢
3. Telefones são persistidos em formato E.164; a interface aplica máscaras nacionais apenas para apresentação/entrada. 🟢
4. Contato pode existir sem empresa. Empresa pode possuir vários contatos e oportunidades. 🟢
5. O título de oportunidade é derivado da empresa; sem empresa, usa o nome do contato vinculado. 🟢
6. Mover a oportunidade para etapa `isWon` muda seu estado para `WON`; etapa `isLost`, para `LOST`; demais etapas mantêm `OPEN`. 🟢
7. Proposta de oportunidade pode ser um link ou um arquivo seguro; o arquivo é referenciado por ativo de mídia, não por URL pública permanente. 🟢
8. Alterar responsável preserva histórico por atividades/auditoria em vez de recriar o registro. 🟢

### 3.3 Conversas e mensagens

1. A identidade de uma conversa é a combinação operacional entre organização, instância e endereço remoto; trocar a conexão é uma ação explícita e auditada. 🟢
2. Mensagem de cliente para conversa encerrada inicia novo atendimento em `WAITING`, sem responsável. Ela não reabre automaticamente para o responsável anterior. 🟢
3. Assumir ou reabrir uma conversa transfere a responsabilidade ao usuário que executou a ação. 🟢
4. Conversas abertas atribuídas a outro usuário ficam invisíveis a usuários comuns. Administradores só veem todas quando solicitam explicitamente a visão global. 🟢
5. Só conversas `OPEN` podem ser fixadas; a fixação é individual por usuário. 🟢
6. Envio manual só ocorre em conversa aberta, atribuída ao operador autorizado e por conexão válida; a API persiste `QUEUED` e o worker efetua a chamada externa. 🟢
7. Texto, legenda e variáveis são resolvidos no instante do envio. A assinatura usa a preferência e o nome do operador/responsável aplicável. 🟢
8. A chegada de mensagem invalida resumos concluídos e sugestões que deixaram de representar o contexto corrente. 🟢
9. Assumir ou encerrar atendimento interrompe sessões automáticas incompatíveis e cancela gerações pendentes de chatbot. 🟢
10. Reações, respostas, edições e exclusões são atualizações idempotentes orientadas pelo identificador da mensagem no provedor. 🟢

### 3.4 Consentimento, descadastro e campanhas

1. Palavras de descadastro reconhecidas revogam consentimento, criam supressão e interrompem destinatários/inscrições ainda ativos. 🟢
2. Campanhas excluem contatos sem endereço válido, duplicados, suprimidos, com consentimento incompatível ou com bloqueio individual de campanhas. 🟢
3. O bloqueio “não enviar campanhas” vale para campanhas de WhatsApp e e-mail; não bloqueia mensagens individuais, follow-up operacional ou leitura do CRM. 🟢
4. Campanha WhatsApp valida previamente a existência da conta no WhatsApp; número inválido torna o destinatário `SKIPPED` e pode ser exportado. 🟢
5. `SKIPPED`, `FAILED`, `OPTED_OUT` e estados terminais contam para encerrar o processamento; uma campanha não permanece em execução por causa de destinatário ignorado. 🟢
6. Campanha WhatsApp pausa quando a conexão fica indisponível. Múltiplas campanhas podem existir, mas limites da conexão e da fila continuam compartilhados. 🟢
7. Resposta a campanha marca o destinatário relacionado como respondido e interrompe a cadência correspondente. 🟢
8. Campanhas manuais de e-mail usam Gmail SMTP com senha de app; e-mails transacionais do sistema usam Mailgun. 🟢
9. Limites de aquecimento são por instância/dia e crescem apenas conforme utilização, falhas técnicas e estabilidade do dia anterior. 🟢

### 3.5 Tarefas e follow-ups

1. Alteração por drag-and-drop muda o horário persistido da tarefa; em tarefa de follow-up também incrementa a revisão e substitui o job atrasado efetivo. 🟢
2. Só pode existir um follow-up `SCHEDULED` ou `RUNNING` por conversa, garantido também por índice parcial no PostgreSQL. 🟢
3. Follow-up e tarefa são criados na mesma transação; a tarefa é a representação de agenda do disparo. 🟢
4. A primeira etapa sai no horário agendado. Cada atraso seguinte começa após sucesso da etapa anterior. 🟢
5. Jobs carregam identificadores/revisão e revalidam banco, estado e horário antes de executar; o PostgreSQL é a fonte de verdade. 🟢
6. Resposta antes do início cancela follow-up e tarefa e avisa o responsável por e-mail; resposta durante a sequência interrompe somente o restante e conclui a tarefa por resposta. 🟢
7. Se a conversa estiver encerrada ou aguardando, a execução a abre e atribui ao responsável preservado antes do envio. 🟢
8. Indisponibilidade da conexão admite recuperação até a tolerância configurada de 30 minutos. Depois, o follow-up falha e a tarefa permanece aberta/vencida. 🟢
9. Concluir ou cancelar manualmente a tarefa vinculada cancela o follow-up pendente. 🟢

### 3.6 Workflows e chatbots

1. Publicação fixa uma versão imutável; execuções em curso continuam na versão original. Alteração posterior exige nova versão. 🟢
2. Workflow publicado pode ser pausado ou arquivado; arquivamento/interrupção encerra inscrições ativas ou em espera. 🟢
3. Esperas persistem `wakeAt`; reconciliadores recuperam jobs perdidos ou reinícios sem polling do navegador. 🟢
4. Uma inscrição opera sobre um contato específico e pode ser iniciada repetidamente por comando manual, conforme a regra atual de reentrada. 🟢
5. Chatbot suporta ciclos controlados pelo grafo e espera por mensagem/tempo; assumir o atendimento interrompe a sessão automática. 🟢
6. Handoff do chatbot sempre leva a conversa à fila `WAITING` sem responsável, inclusive quando a mensagem de fallback falha. 🟢
7. O chatbot só inicia para instância com versão publicada e situação elegível; não substitui atendimento humano já assumido. 🟢

### 3.7 IA e base de conhecimento

1. A API apenas registra e enfileira gerações; o worker chama o provedor configurado. A conversa permanece utilizável durante o processamento. 🟢
2. Sugestão de resposta nunca é enviada automaticamente nem deve sobrescrever texto que o operador começou a digitar. 🟢
3. Resumo e resposta automática são validados como JSON estruturado; falha de provedor ou formato produz estado terminal/fallback, não execução de ferramenta. 🟢
4. A IA não altera CRM diretamente. Mudanças propostas exigem aprovação humana total ou parcial. 🟢
5. Documentos RAG passam por `INDEXING` antes de `READY`; só fragmentos prontos participam da recuperação. 🟢
6. Chave OpenAI é armazenada criptografada e não é devolvida ao navegador. 🟢
7. Atribuição humana cancela geração automática pendente e torna respostas tardias obsoletas. 🟢
8. Não há interpretação visual geral nem execução autônoma de ações externas pela IA atual. 🟢

### 3.8 Integrações, mídia e API pública

1. Credenciais da Evolution, OpenAI, Mailgun e armazenamento nunca devem chegar ao navegador em claro. 🟢
2. Webhooks de entrada respondem rapidamente e delegam processamento idempotente à fila. 🟢
3. Webhooks de saída aceitam apenas destinos HTTP(S) públicos após validação anti-SSRF no cadastro e novamente no worker. 🟢
4. Mídia privada é armazenada por chave e servida por URL assinada ou rota controlada; links públicos permanentes não são a fonte de verdade. 🟢
5. Chaves de API são armazenadas por hash, possuem escopos explícitos e só acessam o subconjunto público de CRM/MCP. 🟢
6. O servidor MCP é adaptador da API REST, anuncia apenas ferramentas permitidas pelos escopos e não oferece exclusão, arquivamento ou cancelamento. 🟢
7. Criações externas sensíveis exigem `Idempotency-Key`; o MCP o encaminha ao criar registros. 🟢

## 4. Eventos relevantes do domínio

| Evento conceitual | Efeito principal | Confiança |
|---|---|---|
| `conversation.received` | Atualiza Inbox, invalida IA, pode iniciar chatbot e interromper campanhas/follow-up. | 🟢 |
| Atendimento assumido/transferido | Atualiza responsável, tarefa/follow-up e interrompe automação conversacional incompatível. | 🟢 |
| Atendimento encerrado/reaberto | Registra evento interno e altera fronteira do atendimento exportável. | 🟢 |
| `message.sent/delivered/read/replied/failed` | Evolui entrega e métricas sem criar outra mensagem lógica. | 🟢 |
| Contato respondeu | Interrompe cadências, follow-up ou automação elegível e cria notificações. | 🟢 |
| `campaign.completed/paused` | Fecha execução ou interrompe consumo da fila por condição operacional. | 🟢 |
| `workflow.published` / `chatbot.published` | Fixa versão executável imutável. | 🟢 |
| `conversation.ai.updated` | Atualiza somente conversa/drawer afetado por Socket.IO. | 🟢 |
| `ai.knowledge.updated` | Atualiza status do documento RAG sem carregar a listagem principal de conversas. | 🟢 |

## 5. Observabilidade encontrada

- O domínio persiste auditoria e eventos internos, enquanto falhas operacionais de filas, Evolution, mídia, manutenção e reconciliadores também são escritas em `stdout/stderr`. 🟢
- Reconciliadores em intervalos curtos são parte deliberada da confiabilidade para follow-ups, esperas de chatbot, IA e documentos; mensagens de log indicam explicitamente que a fila será recuperada. 🟢
- Não há plataforma versionada de métricas/traces distribuídos no repositório. A operação depende de logs de contêiner, registros do banco e estados de fila. 🟢
- Não há arquivos de log rastreados como fonte histórica confiável; logs locais de desenvolvimento não integram esta especificação. 🟢

## 6. Lacunas e riscos semânticos

1. 🔴 Não existe catálogo formal de eventos de domínio; nomes e payloads são definidos localmente por cada serviço.
2. 🟡 A cobertura de auditoria é ampla nas ações centrais, mas não há mecanismo único que garanta auditoria para toda mutação futura.
3. 🟡 A primeira permissão compatível define o escopo (`find`); papéis customizados com wildcard e regra específica conflitantes dependem da ordem persistida.
4. 🔴 Não há política formal versionada para resolver conflito entre titularidade do contato, equipe da instância e responsável da conversa; o Inbox usa regra própria.
5. 🔴 Não há especificação normativa, fora do código, para classificação de campanhas como consentidas/transacionais. A implementação atual aplica bloqueios técnicos comuns.
6. 🟡 A organização única está codificada como premissa operacional, embora o banco modele múltiplas organizações.
7. 🔴 Não há SLO formal para filas, Evolution, e-mail, OpenAI ou transcrição; timeouts e reconciliações funcionam como política implícita.

## 7. Evidências principais

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/seed.ts`
- `apps/api/src/auth/auth.guard.ts`
- `apps/api/src/auth/data-scope.ts`
- `apps/api/src/integrations/conversation-visibility.ts`
- `apps/api/src/integrations/evolution.service.ts`
- `apps/api/src/crm/crm.service.ts`
- `apps/api/src/campaigns/campaigns.service.ts`
- `apps/api/src/follow-ups/follow-ups.service.ts`
- `apps/api/src/workflows/workflows.service.ts`
- `apps/api/src/chatbots/chatbots.service.ts`
- `apps/api/src/ai/ai.service.ts`
- `apps/worker/src/inbound.processor.ts`
- `apps/worker/src/outbound.processor.ts`
- `apps/worker/src/campaign.processor.ts`
- `apps/worker/src/follow-up.processor.ts`
- `apps/worker/src/workflow.processor.ts`
- `apps/worker/src/chatbot.processor.ts`
- `apps/worker/src/ai.processor.ts`
- Histórico Git entre `81d91ff` e `70bf912`

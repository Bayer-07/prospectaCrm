# Análise de código — BZS One

> Extração incremental do Arqueólogo do Reversa.  
> Nível: **Completo** · Organização futura das specs: **Híbrida**.  
> Progresso deste checkpoint: **3 de 16 módulos**.

## 1. Identidade e acesso (`identity-access`)

### Propósito e limites

🟢 **CONFIRMADO** — autentica usuários e chaves de API, mantém sessões, aplica CSRF, permissões e escopo de dados, administra usuários/papéis e emite convites ou recuperações de senha.

Arquivos centrais:

- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.guard.ts`
- `apps/api/src/auth/session-token.service.ts`
- `apps/api/src/auth/data-scope.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.controller.ts`
- `packages/database/prisma/schema.prisma`

### Fluxos e algoritmos principais

| Operação | Fluxo confirmado |
| --- | --- |
| Login | Normaliza e-mail → limita tentativas por IP/e-mail → valida usuário `ACTIVE` e Argon2 → gera CSRF/JWT → grava `Session` e `lastLoginAt` em transação. |
| Autenticação de sessão | Verifica JWT EdDSA/claims → confere hash e sessão no cache/banco → valida expiração/usuário → exige CSRF em mutações por cookie → injeta `AuthContext`. |
| Autenticação de API | Reconhece bearer `pk_` → consulta hash seguro → valida revogação/expiração → restringe rotas e escopos públicos. |
| Convite | Valida papel/equipe e e-mail → reaproveita ou recria usuário suspenso/convidado → invalida convites anteriores → cria token de 72 h → enfileira e-mail idempotente. |
| Recuperação | Responde de modo indistinguível para e-mail existente ou não → invalida tokens anteriores → cria token de 60 min → enfileira e-mail → troca senha e encerra todas as sessões. |
| Autorização | Lê `@RequirePermission(resource, action)` → aceita correspondência exata ou `*` → serviços aplicam `ALL`, `TEAM` ou `OWN` nas consultas. |

### Regras de negócio

1. 🟢 **CONFIRMADO** — cinco falhas de login em 15 minutos bloqueiam novas tentativas para a combinação IP/e-mail (`auth.service.ts:41-76`).
2. 🟢 **CONFIRMADO** — a sessão emitida no login expira em sete dias; o banco guarda somente hashes do JWT e do CSRF (`auth.service.ts:78-96`).
3. 🟢 **CONFIRMADO** — mutações autenticadas por cookie exigem `X-CSRF-Token`; bearer direto não usa essa validação (`auth.guard.ts`).
4. 🟢 **CONFIRMADO** — solicitação de recuperação sempre retorna aceita para evitar enumeração de contas; limita três tentativas por 15 minutos (`auth.service.ts:121-193`).
5. 🟢 **CONFIRMADO** — senha de convite/recuperação requer no mínimo cinco caracteres (`auth.service.ts:107`, `196`).
6. 🟢 **CONFIRMADO** — a organização deve preservar pelo menos um administrador ativo ao alterar ou excluir usuários (`users.service.ts:332-376`, `493-503`).
7. 🟢 **CONFIRMADO** — o papel `admin` precisa conservar permissão global `*:*:ALL` (`users.service.ts:472-487`).
8. 🟢 **CONFIRMADO** — exclusão de usuário é suspensão lógica, invalida sessões/tokens e libera o e-mail para reutilização conforme a migração correspondente.

### Tratamento de erros e segurança

- `UnauthorizedException` diferencia apenas sessão ausente/expirada e credencial inválida, sem revelar contas.
- Cache de autenticação é invalidado em logout, troca de senha, perfil, papel e permissões.
- Comparação de hash CSRF usa `timingSafeEqual`.
- Tokens de convite, reset e API são retornados somente na criação; persistência usa SHA-256.
- Toda administração relevante cria `AuditLog`.

### Dependências

Prisma/PostgreSQL, Argon2, JOSE, BullMQ, Mailgun transacional, mídia de perfil e cache local limitado.

## 2. CRM comercial (`crm-sales`)

### Propósito e limites

🟢 **CONFIRMADO** — agrega empresas, contatos, vínculos, pipelines, oportunidades, tarefas, propostas, notas, atividades, tags, campos personalizados, segmentos e importação CSV.

Arquivos centrais:

- `apps/api/src/crm/crm.service.ts`
- `apps/api/src/crm/crm.controller.ts`
- `apps/api/src/crm/company-cnpj-lookup.service.ts`
- `apps/api/src/crm/company-logo-lookup.service.ts`
- `apps/api/src/crm/link-preview.service.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/whatsapp-contact.ts`

### Fluxos e algoritmos principais

| Operação | Fluxo confirmado |
| --- | --- |
| Listagens | Monta filtros por organização + `ALL/TEAM/OWN` → combina busca/filtros → pagina por cursor composto e ordenação estável. |
| Criar empresa | Valida Zod → faz upsert por `externalId` para API key → normaliza CNPJ → rejeita CNPJ/domínio duplicado → cria e audita → dispara webhook. |
| Criar contato | Valida Zod → normaliza telefone E.164/chave canônica → rejeita telefone duplicado → alerta e-mail duplicado → cria contato/vínculo/consentimento em transação. |
| Mover oportunidade | Confere oportunidade e etapa no mesmo pipeline/escopo → deriva `OPEN/WON/LOST` das flags da etapa → atualiza timestamps → registra atividade/auditoria/webhook. |
| Proposta | Valida link HTTP(S) ou confirma arquivo temporário da organização → troca referência → apaga ativo anterior após sucesso. |
| Tarefa | Valida escopo dos vínculos e responsável → cria/edita/conclui/cancela → se for follow-up, reagendamento altera também o disparo real. |
| CSV | Detecta delimitador entre vírgula, ponto e vírgula e tab → respeita aspas → mapeia colunas → normaliza telefones nacionais → pré-valida ou confirma linha a linha com erro isolado. |

### Regras de negócio

1. 🟢 **CONFIRMADO** — todas as entidades comerciais são isoladas por `organizationId` e, quando aplicável, por equipe ou proprietário.
2. 🟢 **CONFIRMADO** — empresas usam exclusão lógica (`archivedAt`) e deduplicação por CNPJ/domínio (`crm.service.ts:201-224`).
3. 🟢 **CONFIRMADO** — contatos ativos possuem unicidade de `phoneKey` por organização; a normalização considera a variante brasileira com nono dígito.
4. 🟢 **CONFIRMADO** — `externalId` permite upsert idempotente apenas no fluxo autenticado por API key.
5. 🟢 **CONFIRMADO** — `campaignsBlocked` bloqueia campanhas do contato sem revogar, por si só, o atendimento manual.
6. 🟢 **CONFIRMADO** — consentimento concedido/revogado mantém timestamps e histórico; opt-out cria supressão e evento.
7. 🟢 **CONFIRMADO** — status da oportunidade é função da etapa: `isWon` → `WON`, `isLost` → `LOST`, demais → `OPEN`.
8. 🟢 **CONFIRMADO** — valores monetários são inteiros em centavos e moeda padrão BRL.
9. 🟢 **CONFIRMADO** — tarefas usam `OPEN`, `COMPLETED` ou `CANCELLED`; conclusão grava `completedAt`.

### Algoritmos relevantes

- Normalização de CNPJ remove caracteres e valida 14 dígitos/dígitos verificadores nos contratos.
- Chave telefônica canônica transforma variações nacionais/internacionais em uma identidade comparável.
- Busca textual usa índices GIN trigram para nomes, domínios, CNPJ, e-mail, telefone e título.
- Consulta de logo e preview resolve DNS, bloqueia destinos privados, limita redirects/tamanho/timeout e mantém cache limitado.
- Dashboard agrega oportunidades, contatos, tarefas vencidas, conversas, ganhos, distribuição por etapa e produtividade em paralelo.

### Tratamento de erros

- `BadRequestException` para validação, duplicidade, protocolo inseguro, cursor ou transição inválida.
- `NotFoundException` sempre combina ID, organização, escopo e `archivedAt` para impedir enumeração entre carteiras.
- Importação CSV preserva o número da linha e converte falhas Zod/HTTP em mensagens por registro.
- Chamadas externas de CNPJ/logo têm timeout e retornos controlados; logo/preview aplicam proteção SSRF.

## 3. WhatsApp e Inbox (`whatsapp-inbox`)

### Propósito e limites

🟢 **CONFIRMADO** — administra conexões Evolution, tickets compartilhados, visibilidade por atendente/equipe, mensagens multimídia, status de entrega, eventos internos, paginação, exportação e ingestão idempotente de webhooks.

Arquivos centrais:

- `apps/api/src/integrations/evolution.service.ts`
- `apps/api/src/integrations/integrations.controller.ts`
- `apps/api/src/integrations/conversation-visibility.ts`
- `apps/worker/src/inbound.processor.ts`
- `apps/worker/src/outbound.processor.ts`
- `apps/worker/src/evolution-client.ts`
- `apps/web/src/pages/Inbox.tsx`

### Fluxo de entrada

1. 🟢 **CONFIRMADO** — webhook público valida segredo e grava `InboundWebhookEvent` com chave única antes de responder.
2. 🟢 **CONFIRMADO** — worker localiza a instância pelo `instanceKey`, normaliza o evento e atualiza `lastEventAt` com escrita limitada.
3. 🟢 **CONFIRMADO** — dispatcher trata conexão, upsert/envio, update, edição e exclusão.
4. 🟢 **CONFIRMADO** — número desconhecido cria contato mínimo e conversa `WAITING`; conversa encerrada volta a `WAITING` sem responsável quando chega nova mensagem.
5. 🟢 **CONFIRMADO** — mensagem é deduplicada por `(instanceId, providerMessageId)`, persiste payload original, mídia e resposta citada.
6. 🟢 **CONFIRMADO** — resposta do cliente cancela follow-up prévio ou interrompe etapas restantes, para automações/campanhas pertinentes e pode acionar chatbot.
7. 🟢 **CONFIRMADO** — evento processado publica atualização dirigida via Redis/Socket.IO.

### Fluxo de saída

1. API exige conversa `OPEN` com responsável e texto ou mídia.
2. Variáveis são renderizadas no momento do envio; assinatura opcional vira `*Nome:*\nMensagem`.
3. Cria `Message` local `QUEUED` com ID determinístico de job e marca resumos de IA como obsoletos.
4. Worker valida se automação/follow-up ainda está ativo, gera URL assinada ou base64 de áudio e monta quoted message.
5. Evolution confirma o envio; o worker troca o ID local pelo ID do provedor, marca `SENT` e atualiza conversa/follow-up.
6. Falhas recebem retry exponencial; falha terminal preserva motivo e interrompe follow-up associado.

### Estados e regras de atendimento

- `WAITING`: fila sem atendente.
- `OPEN`: atendimento assumido e atribuído.
- `CLOSED`: atendimento encerrado.
- 🟢 **CONFIRMADO** — reabrir uma conversa transfere a responsabilidade ao usuário que executou a ação.
- 🟢 **CONFIRMADO** — encerrar conclui sessões de chatbot e cancela gerações automáticas pendentes.
- 🟢 **CONFIRMADO** — assumir uma conversa também cancela resposta automática pendente e transfere tarefa/follow-up ativo.
- 🟢 **CONFIRMADO** — usuário comum vê tickets próprios e fila sem responsável da equipe; administrador pode optar por visão geral.
- 🟢 **CONFIRMADO** — apenas conversas `OPEN` podem ser fixadas por usuário.

### Mensagens e sincronização

- Histórico carrega 30 mensagens por padrão, aceita 1–50 e usa cursor; eventos internos do mesmo intervalo são mesclados cronologicamente.
- Texto, imagem, vídeo, áudio, documento, figurinha, localização e contato compartilhado possuem tratamento específico.
- Edição preserva histórico anterior no payload; exclusão mantém texto/tipo e apenas marca metadados.
- Status nunca regride de entregue/lido para falha por evento tardio.
- Reconciliação incremental consulta até 50 mensagens recentes por instância desde a conexão; backoff aumenta em ociosidade e volta ao intervalo rápido com atividade.
- LID e JID telefônico são reconciliados para preservar a identidade e mesclar conversas duplicadas.

### Segurança e isolamento

- Credencial da Evolution fica somente no backend.
- Instâncias são isoladas por organização e equipes; cada operação valida acesso antes da chamada remota.
- Mídia de envio precisa ter chave prefixada pelo `organizationId`.
- Reação, edição, exclusão e resposta exigem mensagem pertencente à conversa e estado remoto compatível.
- Perfil e previews externos limitam cache/tamanho e validam destinos.

## 4. Campanhas e e-mail (`campaigns-email`)

### Propósito e limites

O módulo cria campanhas de WhatsApp ou e-mail, resolve a audiência, valida destinatários, executa cadências em segundo plano e consolida o progresso. A API cobre criação por agenda, filtros ou CSV, pré-validação, agendamento, pausa, retomada, cancelamento e exclusão lógica. O worker envia uma campanha por destinatário e uma bolha por job, evitando manter trabalho longo dentro de uma requisição HTTP.

### Preparação da campanha

1. A API valida título, canal, número conectado para WhatsApp, assunto para e-mail e ao menos uma mensagem fora do modo CSV.
2. A cadência passa por schema com mínimos/máximos coerentes; a janela padrão permite todos os dias, de `00:00` a `23:59`.
3. Audiência da agenda aceita IDs explícitos e até 20 termos de busca. Um termo vazio significa selecionar todos os contatos acessíveis; exclusões manuais prevalecem.
4. CSV detecta vírgula, ponto e vírgula ou tabulação, normaliza cabeçalhos, telefone e duplicatas e exige uma ou mais colunas de mensagem.
5. Contatos ainda inexistentes no CSV são criados na mesma transação da campanha. Contato existente fora da carteira/equipe do usuário bloqueia a importação inteira.
6. Destinatários são inseridos em lotes de 1.000; mensagens personalizadas ficam no destinatário e substituem as bolhas gerais.

### Pré-validação e elegibilidade

- 🟢 **CONFIRMADO** — `campaignsBlocked` exclui o contato dos dois canais.
- WhatsApp exclui telefone ausente, suprimido, duplicado ou inexistente na consulta à Evolution.
- E-mail exclui endereço ausente, suprimido ou duplicado.
- A verificação do WhatsApp é refeita no primeiro envio quando estiver ausente ou tiver mais de 24 horas.
- Números sem WhatsApp podem ser exportados em CSV UTF-8/BOM com nome e telefone.
- O progresso deriva do estado real dos destinatários: audiência, enviados, respostas, pendentes, falhas e ignorados.

### Execução WhatsApp

1. `dispatch-campaign` valida estado, conexão, janela, dias e teto diário de aquecimento.
2. Seleciona o primeiro destinatário `PENDING`, troca atomicamente para `QUEUED` e agenda a primeira bolha.
3. Cada bolha renderiza variáveis no momento do envio, resolve mídia por URL assinada ou base64 para áudio e chama a Evolution.
4. A mensagem enviada é registrada na conversa; se ainda não existir conversa, o worker a cria e adiciona evento interno da campanha.
5. A bolha seguinte recebe atraso aleatório configurado. Ao terminar a sequência, incrementa contadores da campanha e do aquecimento.
6. Entre destinatários ou lotes aplica atraso aleatório próprio. Campanhas diferentes podem progredir em paralelo pela mesma fila.
7. Conexão fechada devolve o destinatário para `PENDING`, marca somente a instância e a campanha afetadas como desconectada/pausada.

### Execução de e-mail

- Campanhas manuais usam Gmail SMTP com senha de aplicativo, conexão segura na porta 465, pool limitado a uma conexão e remetente configurável.
- Assunto e HTML aceitam as mesmas variáveis de contato; texto simples é derivado do HTML e ambos recebem descadastro por `mailto`.
- Falhas 4xx e de transporte são retentáveis; falhas permanentes encerram o destinatário e preservam a razão.
- O webhook do Mailgun permanece responsável por eventos de entrega legados/sistêmicos: valida HMAC e tolerância temporal, deduplica por ID e atualiza entregue, lido, clicado, falhou ou descadastrado.
- Descadastro e reclamação criam supressão global de e-mail.

### Recuperação e estados

- `DRAFT → SCHEDULED/RUNNING → PAUSED/COMPLETED/CANCELLED/FAILED`.
- O reconciliador conclui campanhas sem destinatários pendentes e reintroduz campanhas `RUNNING` que tenham trabalho no banco, mas nenhum job correspondente.
- Destinatários `SKIPPED` e `OPTED_OUT` contam como concluídos; uma campanha termina quando não resta `PENDING` nem `QUEUED`.
- Exclusão é lógica, cancela campanha ativa e marca destinatários não processados como ignorados, preservando histórico.

## 5. Chatbots (`chatbots`)

### Propósito e modelo de execução

Cada chatbot pertence a uma conexão do WhatsApp e possui versões imutáveis após publicação. Apenas um chatbot pode ficar `PUBLISHED` por instância; publicar outro pausa o anterior. A sessão é única por conversa e fixa a versão usada até terminar, ser transferida ou ser reiniciada por uma nova versão/chatbot.

### Validação do mapa

- Até 100 blocos, IDs únicos e arestas apontando apenas para nós existentes.
- Publicação exige exatamente um gatilho e ao menos um bloco terminal: transferir, encerrar ticket ou finalizar bot.
- Mensagem/pergunta exige texto; espera aceita de 1 segundo a 31.536.000 segundos.
- Condição exige saídas `Sim` e `Não`; bloco terminal não aceita saída; demais blocos exigem exatamente uma.
- Todos os blocos precisam ser alcançáveis a partir do gatilho.
- Ciclos são permitidos apenas quando atravessam uma fronteira assíncrona: pergunta, espera ou atendimento por IA.
- Bloco de IA só pode ser publicado com motor OpenAI e precisa conduzir diretamente a uma transferência humana.

### Mensagem recebida e sessão

1. O worker ignora mensagem que não seja de entrada, conversa encerrada/atribuída ou contato com consentimento revogado.
2. Localiza o chatbot publicado da instância e a versão fixada por `publishedVersion`.
3. Monta contexto com mensagem atual/anterior e dados do contato/empresa.
4. Uma mensagem já registrada em `lastInboundMessageId` não é processada novamente.
5. Sessões transferidas ou paradas não reentram; concluídas/falhas podem ser reiniciadas. Enquanto houver uma espera temporal ativa, novas mensagens são ignoradas.
6. O motor de regras normaliza acentos e caixa, aceita contém/igual/começa/termina e interpola variáveis compartilhadas.

### Blocos e efeitos

- `message`: cria resposta automática e segue.
- `question`: envia a pergunta e estaciona em `WAITING` até a próxima mensagem.
- `wait`: persiste `wakeAt`, registra a etapa e agenda job determinístico; reconciliador recupera esperas nas próximas 24 horas.
- `ai_conversation`: cria geração deduplicada de prioridade alta, cancela geração anterior superada e aguarda a fila de IA.
- `condition`: escolhe a aresta verdadeira ou falsa.
- `add_tag`: faz upsert do vínculo com tag.
- `handoff`: encerra a sessão como transferida, põe o ticket em `WAITING`, remove responsável e notifica equipe/admin.
- `close`: conclui a sessão e fecha o ticket; `end` conclui a sessão, mantendo o ticket aguardando.

### Idempotência e interrupção

`ChatbotStepExecution` é único por sessão, bloco e mensagem de entrada. Respostas automáticas usam ID de provedor determinístico e só são enfileiradas uma vez. A execução síncrona limita 100 blocos por passagem. Assumir/encerrar a conversa, pausar, arquivar ou excluir o chatbot interrompe sessões e esperas sem apagar histórico.

## 6. Automações (`workflows`)

### Propósito e versionamento

As automações executam jornadas orientadas a contato com ações de WhatsApp e CRM. Rascunhos publicados se tornam imutáveis; salvar depois de publicar cria uma nova versão. Cada inscrição referencia a versão original, portanto uma nova publicação não altera execuções em andamento.

### Validação do grafo

- O grafo publicado exige um único gatilho, pelo menos um fim, IDs únicos, arestas válidas e todos os nós conectados.
- A v1 proíbe ciclos no workflow.
- Blocos validam suas configurações mínimas: mensagem, condição, espera, campo, etapa, atribuição ou tag.
- Tipos suportados: gatilho, condição, enviar WhatsApp, esperar, atualizar registro, mover etapa, atribuir, adicionar/remover tag, criar tarefa, notificar e finalizar.

### Inscrição

- A automação precisa estar publicada; o usuário só acessa registros dentro de seu escopo de workflows.
- Inscrição em lote remove IDs repetidos e evita reentrada do mesmo contato na mesma versão, em lotes de 500.
- Início manual pelo chat sempre cria uma nova inscrição, fixa conversa/instância/usuário no contexto e registra evento interno; ele não é bloqueado pela regra de uma inscrição por versão.
- Cada inscrição gera job com ID baseado no enrollment e retry exponencial.

### Motor de execução

1. Carrega inscrição ativa/aguardando, contato, workflow e versão publicada.
2. Registra uma execução de etapa como `running`.
3. Executa um único nó por job, persiste o próximo nó e agenda outro job pequeno.
4. Espera armazena `wakeAt` e agenda job atrasado; versões antigas em minutos continuam compatíveis, novas usam segundos.
5. Condição lê caminho aninhado do contato e suporta igual, diferente, contém e vazio.
6. Fim ou ausência de aresta conclui a inscrição; erro marca etapa e inscrição como falhas e registra motivo.

### Ações e regras

- Enviar WhatsApp bloqueia consentimento revogado e supressão. Início manual pela conversa pode enviar quando consentimento é desconhecido, mas nunca quando revogado.
- A conexão pode vir do bloco ou da conversa. A conversa existente precisa pertencer ao mesmo contato; conflito de número com outro contato interrompe a execução.
- Variáveis são renderizadas no envio e a assinatura do usuário iniciador é aplicada se estiver ativada.
- Atualização direta é restrita a nome, e-mail, cargo e origem; demais chaves vão para `customFields`.
- Mover etapa atualiza todas as oportunidades do contato naquele funil, incluindo probabilidade e estado ganha/perdida.
- Atribuir valida usuário/equipe da organização. Tags são validadas antes de adicionar/remover.
- Criar tarefa escolhe usuário iniciador, administrador ou responsável do contato; notificação usa responsável/iniciador configurado.
- Execuções iniciadas pelo chat registram início, conclusão, interrupção ou falha como eventos internos e publicam atualização do Inbox.

## 7. Follow-ups automáticos (`follow-ups`)

### Agendamento e edição

O módulo agenda uma ação futura para uma conversa e cria, na mesma transação, uma tarefa de calendário intitulada `Follow-up · <contato>`. A conversa precisa estar atribuída, e o usuário precisa possuir escrita em conversas e tarefas; o modo automação exige ainda escrita em workflows.

- `MESSAGE_SEQUENCE` aceita de 1 a 20 etapas com texto, imagem ou documento. A primeira etapa usa o horário do follow-up e as posteriores guardam atraso próprio entre 0 e 31.536.000 segundos.
- `WORKFLOW` fixa a versão publicada no momento do agendamento. Alterações futuras no workflow não afetam o follow-up.
- Uma restrição parcial no PostgreSQL impede dois follow-ups `SCHEDULED` ou `RUNNING` na mesma conversa, inclusive sob concorrência.
- Apenas follow-up `SCHEDULED` pode ser editado. A edição incrementa `revision`, substitui as etapas e cria outro job determinístico; jobs da revisão anterior se tornam inofensivos.
- Arrastar a tarefa no calendário altera `scheduledAt`, incrementa a revisão e reagenda o disparo real. Concluir ou cancelar manualmente a tarefa cancela o follow-up após confirmação.

### Execução persistente

1. A API persiste follow-up, tarefa, etapas, evento interno e auditoria antes de enfileirar.
2. O worker recarrega o banco e valida estado, revisão, etapa e horário; o Redis não é a fonte de verdade.
3. Se a conversa estiver encerrada ou aguardando, ela é reaberta e atribuída ao responsável preservado antes do envio.
4. A etapa muda atomicamente de `PENDING` para `QUEUED`, cria uma `Message` com identificador determinístico e entra na fila de saída.
5. Somente a confirmação de envio da etapa atual agenda a próxima, usando seu `delaySeconds`.
6. A última etapa conclui follow-up e tarefa. No modo workflow, a tarefa termina quando a inscrição na versão fixada é criada.

O reconciliador roda na inicialização e a cada minuto, consultando índices de estado/horário e recuperando até 1.000 follow-ups ou etapas relevantes nas próximas 24 horas. A fila usa jobs pequenos, remove históricos antigos do Redis e mantém o histórico comercial no PostgreSQL.

### Interrupções, falhas e regras comerciais

- Resposta do cliente antes do início cancela follow-up e tarefa, gera log/notificação e solicita e-mail ao responsável.
- Resposta durante a sequência marca `INTERRUPTED`, cancela somente etapas restantes e conclui a tarefa sem e-mail.
- Instância desconectada é tentada novamente a cada minuto dentro da tolerância de 30 minutos. Depois desse prazo, o follow-up falha, as etapas posteriores são canceladas e a tarefa permanece aberta e vencida.
- Consentimento revogado ou supressão de WhatsApp bloqueiam o envio. `campaignsBlocked` não se aplica a follow-up individual.
- Variáveis e assinatura do responsável atual são resolvidas no instante de cada envio.
- Transferir a conversa atualiza o responsável do follow-up e da tarefa; ficar temporariamente sem atendente preserva o último responsável.

## 8. Inteligência artificial e base de conhecimento (`ai-knowledge`)

### Configuração e segurança

A organização pode habilitar a OpenAI, selecionar um modelo de uma lista curada, definir instruções globais e uma mensagem de fallback. A configuração é exclusiva de administradores e depende também de `AI_ASSISTANT_ENABLED=true` no servidor.

- A chave pode vir da organização ou de `OPENAI_API_KEY`; a credencial da organização tem precedência.
- A chave persistida é criptografada e a API devolve somente origem e quatro últimos caracteres.
- Ativação sem chave é recusada. Remover a única chave é bloqueado enquanto existirem documentos na base, pois eles ainda precisam ser excluídos remotamente.
- A integração usa a Responses API com `store: false`, saída JSON Schema estrita, limite de tempo e `file_search` opcional.
- Prompts tratam mensagens e documentos como dados não confiáveis, instruem contra prompt injection e proíbem inventar preços, prazos e compromissos.
- Uma regra obrigatória força português do Brasil; detector heurístico de inglês repete a geração uma vez e falha caso o segundo resultado continue em inglês.

### Gerações manuais e persistência

`ConversationAiGeneration` representa resumo, sugestão, resposta automática ou teste administrativo. A API calcula uma chave SHA-256 com tipo, conversa, escopo, limites de mensagem e responsável; duplo clique e retry reutilizam o mesmo registro.

- Resumo atual começa no último evento `started`/`reopened`; resumo completo usa toda a conversa.
- Conversas longas são lidas em páginas de 500, transformadas em timeline com eventos internos, divididas em blocos de até 9.000 caracteres e consolidadas hierarquicamente.
- Sugestão usa o último resumo válido, contato/empresa e até 12 mensagens recentes. Ela se torna `STALE` se mensagem ou responsável mudar durante a geração.
- Áudio sem transcrição coloca a geração em `WAITING_INPUT`, agenda transcrição e tenta retomar a cada cinco segundos, por até 20 ciclos.
- No navegador, a sugestão só entra automaticamente se o composer continuar vazio, sem anexo e na mesma revisão. Caso contrário, aparece como proposta com botão `Inserir`.
- O worker executa uma geração por vez, priorizando chatbot, sugestão, resumo e teste. Gerações `RUNNING` abandonadas por cinco minutos voltam a `PENDING`; o reconciliador roda a cada 30 segundos.

### Pré-atendimento por IA

O bloco `ai_conversation` opera apenas em conversa sem atendente e mantém a sessão esperando novas mensagens enquanto a decisão for `continue`.

1. Carrega contato, empresa, sessão, últimas 12 mensagens e base vetorial pronta.
2. Mídia sem legenda provoca fallback e handoff; áudio aguarda transcrição.
3. O modelo retorna mensagem, ação, confiança e proposta opcional em JSON validado.
4. Pedido de handoff, confiança abaixo do mínimo ou limite de 1–20 interações força a transferência.
5. A resposta automática é registrada como `Message QUEUED` com identificador `ai:<generationId>` e enviada pela fila normal.
6. Assumir a conversa antes ou durante a geração cancela a resposta. Em falha, o fallback é tentado, mas o handoff acontece mesmo se seu envio falhar.

Propostas de nome, e-mail, cargo, empresa e nota de qualificação só são criadas no handoff. Um usuário com escrita em contatos escolhe campos individualmente; empresa exige correspondência exata única ou seleção explícita, e nunca é criada automaticamente.

### RAG documental

- A interface aceita arrastar múltiplos PDF, Word, PPTX, TXT, Markdown, HTML ou JSON, até 25 MB cada.
- O arquivo entra primeiro no armazenamento interno e depois em `AiKnowledgeDocument(INDEXING)`.
- O worker cria um Vector Store por organização, envia o arquivo à OpenAI, anexa com chunking automático e consulta o estado a cada três segundos por até cinco minutos.
- Apenas quando existe documento `READY` o `openAiVectorStoreId` é enviado nas sugestões e no chatbot. Resumos não usam file search.
- As fontes recuperadas são guardadas junto ao resultado da geração.
- Exclusão é assíncrona: marca `DELETING`, remove arquivo remoto e original interno e só então exclui os registros. Falhas ficam diagnosticadas e podem ser reprocessadas.

## 9. Mídias e transcrição (`media-transcription`)

### Upload, isolamento e URLs assinadas

O backend mantém metadados no PostgreSQL e objetos em armazenamento compatível com S3/MinIO. O navegador nunca recebe credenciais: solicita uma URL `PUT` válida por 10 minutos, envia o arquivo diretamente e usa uma URL `GET` de 15 minutos para visualização ou download.

- Upload geral aceita imagens JPG/PNG/WebP/ICO, áudio OGG/MP3/MP4/WebM, vídeo MP4, PDF, Office e texto compatíveis, com limite confirmado de 25 MB.
- Foto de usuário e logo de empresa aceitam imagens compatíveis até 5 MB. Resposta rápida, proposta e documento de IA possuem listas próprias mais restritas.
- A chave começa pelo `organizationId`, data e UUID; o nome é normalizado e limitado. Toda leitura, confirmação ou exclusão valida o prefixo da organização.
- Antes de vincular uma mídia privilegiada, a API executa `HEAD` no objeto e confere tamanho e MIME declarados. Um asset já associado a outro domínio não pode ser reutilizado.
- `S3_SECRET_KEY` é obrigatória e não possui fallback conhecido. Endpoints interno, público e de entrega são separados para permitir que API, navegador e container da Evolution alcancem o mesmo objeto com rotas apropriadas.
- Na inicialização a API verifica/cria o bucket. Em produção, falha ao preparar o armazenamento impede o serviço de fingir disponibilidade.

### Mensagens recebidas e enviadas

Mídias recebidas são obtidas em base64 pela Evolution, verificadas antes e depois da decodificação contra 25 MB, gravadas no armazenamento interno e ligadas à `Message` por `MediaAsset`. A concorrência desse trabalho pesado é limitada a 1 por padrão e no máximo 2.

No envio, imagem/vídeo/documento recebem URL temporária alcançável pela Evolution. Áudio é lido com limite de 25 MB e enviado em base64 para o endpoint específico `sendWhatsAppAudio`; texto junto de mídia vira caption. O asset precisa pertencer à mesma organização da conversa.

A interface busca a URL apenas quando renderiza a mídia, mantém cache menor que sua validade, usa carregamento preguiçoso de imagens e abre visualizador local. Downloads pedem `Content-Disposition: attachment`; exibição usa `inline`.

### Transcrição de áudio

1. Usuário visível para a conversa solicita `POST /conversations/:id/messages/:messageId/transcription`.
2. A API confirma que a mensagem ou seu anexo é áudio. Resultado já concluído é reutilizado; processamento com menos de 10 minutos não é duplicado.
3. Um `updateMany` reserva atomicamente a mensagem como `PROCESSING` e enfileira job com três tentativas e backoff exponencial.
4. O worker lê o objeto com limite configurável entre 1 e 100 MB, padrão 25 MB, e envia multipart para uma API compatível com OpenAI.
5. O padrão local é Speaches com `Systran/faster-whisper-small`, idioma `pt`, timeout de 120 segundos e concorrência 1–3.
6. Se o provedor local responder que o modelo não está instalado, um único download concorrente é iniciado e a transcrição é repetida. Para endpoint oficial da OpenAI, a chave pode reutilizar `OPENAI_API_KEY`.
7. Sucesso persiste texto, provedor/modelo e data; falha terminal guarda erro limitado. Ambos publicam `inbox.updated` para atualizar apenas a conversa afetada.

Transcrições também são dependência da IA e do PDF do atendimento. A IA estaciona em `WAITING_INPUT`; o PDF solicita transcrição dos áudios ainda pendentes antes de montar o documento.

### Retenção e limpeza

Manutenção horária remove mensagens além de `messageRetentionMonths` em lotes de 1.000, no máximo 10 lotes por execução. Os objetos S3 são excluídos antes dos registros; se a remoção física falhar, o lote do banco é preservado para evitar órfãos silenciosos. Assets vinculados a usuário, empresa, resposta rápida, oportunidade ou RAG só podem ser removidos por seus fluxos proprietários.

## 10. Relatórios e webhooks externos (`reports-webhooks`)

### Consolidação gerencial

O relatório recebe intervalo opcional; sem datas, usa os 30 dias anteriores. O escopo de oportunidades respeita as permissões de dados do usuário, enquanto campanhas, conversas, atividades e tarefas são agregadas dentro da organização.

1. Onze consultas independentes rodam em paralelo para etapas, oportunidades abertas/ganhas/perdidas, campanhas, destinatários, conversas, primeira resposta, atividades e tarefas.
2. O tempo de primeira resposta é calculado diretamente no PostgreSQL pela média de `firstResponseAt - createdAt`.
3. Conversão comercial usa `ganhas / (ganhas + perdidas)`, arredondada para uma casa decimal.
4. O PDF reutiliza exatamente o resumo calculado, incorpora fontes Poppins, cria novas páginas conforme o espaço e formata datas em `America/Sao_Paulo` e valores em BRL.
5. A exportação CSV de empresas aplica escape de aspas, BOM UTF-8 e o escopo comercial atual.

🟢 **CONFIRMADO** — o gráfico de evolução mensal exibido no navegador ainda usa cinco valores ilustrativos fixos; somente o último ponto deriva da receita ganha. Ele não representa uma série histórica calculada pelo backend.

### Cadastro e emissão de webhooks

- A organização pode manter vários webhooks, cada um ligado a uma de 14 ações de empresa, contato, oportunidade ou tarefa.
- Nome aceita 2–120 caracteres; endpoint aceita até 2.048 caracteres e precisa ser HTTP(S) público, sem credenciais embutidas.
- Um segredo aleatório de 32 bytes é criado, armazenado criptografado e retornado somente na criação. O webhook nasce desativado.
- Cada auditoria comercial procura webhooks ativos para a ação, cria `WebhookDelivery` com `eventId` aleatório e agenda job determinístico. O payload preserva tipo, ID, estado anterior e posterior da entidade.
- A chamada externa é `GET`; metadados seguem na query string e em cabeçalhos. A assinatura HMAC-SHA256 cobre horário, evento, tipo e entidade.

### Segurança, retry e idempotência

O endpoint é resolvido no cadastro e novamente imediatamente antes da chamada. Hostnames locais, credenciais na URL e endereços loopback, privados, link-local, CGNAT, documentação e multicast são recusados. O `lookup` HTTP fica preso aos IPs públicos resolvidos; até três redirecionamentos são aceitos e cada destino é revalidado, reduzindo SSRF e DNS rebinding.

O worker usa timeout de 15 segundos, concorrência 5 e até oito tentativas com backoff exponencial. Sucesso marca `delivered`; falha registra erro, incrementa tentativas e muda para `retrying` ou `dead_letter`. A combinação webhook/evento é única, e entregas concluídas ou webhooks desativados são ignorados.

## 11. Respostas rápidas (`quick-replies`)

### Catálogo compartilhado

Respostas rápidas pertencem à organização e ficam disponíveis a toda a equipe com leitura de conversas. Escrita em conversas libera criar, editar e excluir. A listagem ordena por atalho e aceita busca insensível a caixa por título, atalho ou texto.

- O título é obrigatório e limitado a 100 caracteres.
- O atalho remove `/`, acentos e caracteres inválidos, transforma espaços em hífen, converte para minúsculas e limita a 40 caracteres.
- Cada atalho é único por organização; conflito Prisma `P2002` vira mensagem de domínio.
- O texto aceita até 4.096 caracteres. Uma resposta precisa ter texto, anexo ou ambos.
- O anexo opcional pode ser imagem JPEG/PNG/WebP, PDF ou Word, entre 1 byte e 25 MB, e não pode estar vinculado a outro recurso.

Criação e alteração confirmam no S3 a existência, tamanho e MIME do asset antes de vinculá-lo. Trocar ou excluir anexo remove o objeto antigo depois da atualização principal; falha nessa limpeza não desfaz a resposta salva. Todas as mutações geram auditoria.

### Inserção no atendimento

Digitar `/` no composer abre o seletor com busca, setas, Enter e Escape. Ao escolher uma resposta, o navegador baixa o anexo por URL temporária, reconstrói um `File` local e preenche texto e arquivo no composer. Nada é enviado nessa etapa: o operador pode editar ou remover o conteúdo antes de confirmar. Variáveis como `{{saudacao}}` e `{{nome}}` permanecem literais e só são resolvidas pelo fluxo normal no momento do envio.

## 12. Tempo real e notificações (`realtime-notifications`)

### Canal Socket.IO autenticado

O gateway usa o namespace `/realtime`, CORS configurado e cookies. Na conexão, valida token assinado, hash da sessão no banco, identidade, expiração e estado ativo do usuário. Somente depois inclui o socket nas salas `organization:<id>` e `user:<id>`; logout administrativo pode desconectar todas as sessões Socket.IO do usuário.

Workers publicam envelopes em `prospecta:realtime` pelo Redis. A API assina esse canal e retransmite para a organização e, quando informado, para o usuário. Payload inválido é descartado sem derrubar o subscriber.

### Atualização seletiva do navegador

- `inbox.updated` invalida listas/contagens e busca apenas as 30 mensagens mais recentes da conversa afetada; a mesclagem deduplica por ID e preserva páginas antigas.
- `whatsapp.updated`, `tasks.updated`, `conversation.ai.updated` e `ai.knowledge.updated` invalidam somente suas chaves React Query.
- Invalidações iguais são agrupadas por 100 ms e refreshes concorrentes do mesmo histórico são serializados com uma nova passagem sinalizada.
- Ao conectar ou reconectar, a interface reconcilia Inbox e conexões por HTTP para cobrir a janela entre a primeira consulta e a entrada na sala.
- Enquanto Socket.IO está conectado, o polling de notificações é desativado; desconectado, volta a cada 30 segundos.

### Notificações persistentes e som

`Notification` é individual por usuário. A API retorna no máximo 100 não lidas recentes e permite marcar uma ou todas como lidas, sempre restringindo pelo `userId` autenticado. Conversas, follow-ups, automações, chatbots e IA criam notificações com tipo, título, corpo e rota opcional.

Mensagem recebida toca um aviso sintetizado por Web Audio uma única vez por ID. Com a página focada, a conversa aberta é silenciada; sem foco, o som também toca para a conversa atual. Usuário comum não ouve conversa atribuída a outra pessoa, enquanto administrador pode ouvir. O navegador exige uma primeira interação para liberar o `AudioContext`.

🟡 **INFERIDO** — a interface escuta `notification.created`, mas não foi encontrado produtor explícito desse nome de evento no código atual. As principais criações ainda chegam à tela por eventos de domínio como `inbox.updated` ou pelo polling de contingência.

## 13. API externa e servidor MCP (`external-api-mcp`)

### Chaves, escopos e superfície pública

Uma chave externa é emitida no formato `pk_<prefixo>_<segredo>`, mas somente seu SHA-256 fica persistido. O valor em claro é devolvido uma única vez; expiração, revogação e último uso permanecem auditáveis. O guard aceita essas credenciais apenas no subconjunto público de empresas, contatos, oportunidades, funis, tarefas, tags, campos personalizados, segmentos e MCP.

- Cada chave possui escopos `recurso:ação`; `*:*` e `recurso:*` ampliam a autorização.
- O contexto produzido pela chave usa escopo de dados `all`, mas somente para operações explicitamente liberadas pela própria chave.
- O Swagger externo filtra a documentação para os recursos comerciais úteis e descreve DTOs, exemplos, erros, cursores, `externalId` e idempotência.
- Criações sensíveis feitas por chave exigem `Idempotency-Key` entre 8 e 160 caracteres. A combinação organização/chave/rota é única por 24 horas; reutilizar a chave com outro corpo retorna conflito.
- Empresas, contatos e oportunidades aceitam `externalId` para upsert, e listagens usam paginação por cursor.

### Adaptador MCP

O MCP é um processo HTTP separado, stateless, exposto por padrão em `127.0.0.1:3100/mcp`. Antes de criar uma sessão Streamable HTTP, ele valida `Host`, `Origin` e um Bearer `pk_`, consultando `/api/v1/mcp/context` na API principal.

O servidor possui 27 ferramentas potenciais e registra dinamicamente apenas aquelas cobertas pelos escopos da chave. Elas leem, criam e editam empresas, contatos, oportunidades, tarefas, tags, campos personalizados e segmentos; também listam funis, usuários e equipes. Não existe ferramenta de exclusão, arquivamento ou cancelamento.

- Entradas são validadas por schemas Zod e resultados incluem texto JSON e `structuredContent`.
- Ferramentas de criação aceitam chave idempotente; sem uma chave fornecida, o cliente gera um UUID por chamada.
- O cliente só aceita caminhos relativos iniciados por `/`, rejeita `..`, aplica timeout padrão de 15 segundos e limita erros devolvidos a 2.000 caracteres.
- Anotações MCP distinguem leitura, criação e atualização e declaram todas as ferramentas como não destrutivas.

## 14. Interface web (`web-interface`)

### Composição, navegação e autenticação

A SPA usa React 19, Vite, React Router e TanStack Query. Todas as páginas protegidas e o Shell são carregados de forma preguiçosa; o provider de autenticação consulta `/auth/me`, compartilha login/logout/expiração entre abas via `localStorage` e redireciona imediatamente para o login em qualquer `401` fora das rotas públicas.

- O Shell organiza Trabalho, Conversas e Gestão e filtra cada item com as permissões do usuário. Inteligência artificial exige administrador.
- A ação global `Novo` oferece somente contato, empresa ou oportunidade que o usuário possa criar.
- `Ctrl + K` abre busca com debounce de 220 ms, navegação por teclado e até cinco resultados por tipo em atendimentos ativos, empresas, contatos e oportunidades.
- O Inbox usa um layout de altura total próprio; demais páginas compartilham cabeçalho, conteúdo e navegação responsiva.
- O Vite usa URLs relativas por padrão e proxies locais para API, Swagger e Socket.IO; hosts adicionais são configuráveis por ambiente.

### Estado remoto, feedback e acessibilidade

O cliente HTTP envia cookies e CSRF, transforma falhas em toasts e mantém a URL base configurável. O Query Client usa cache padrão de 20 segundos, uma tentativa de retry e invalidação seletiva pelos eventos em tempo real.

- Toasts têm quatro tons, duração padrão de dois segundos, barra de progresso pausável no hover/foco, deduplicação por dois segundos e limite visual de cinco itens.
- Componentes comuns encapsulam botões, campos, selects, modais, estados vazios, status e loading. Modais usam `dialog` e backdrop em botão nativo.
- Tema claro/escuro persiste no navegador e respeita a preferência do sistema na primeira visita.
- A camada final `apple-ui.css` remapeia tokens históricos para tipografia, cores, materiais, profundidade e movimento consistentes. `prefers-reduced-motion` remove deslocamentos e preserva apenas feedback essencial.
- O composer, menus, drawers, Kanban, calendário e uploads mantêm interações especializadas sem criar um segundo framework visual.

## 15. Plataforma assíncrona (`async-platform`)

### Filas e isolamento de trabalho

A API persiste o comando de domínio e publica jobs BullMQ; um processo worker separado executa I/O demorado. Redis transporta filas e eventos, enquanto PostgreSQL continua sendo a fonte de verdade de campanhas, mensagens, automações, follow-ups e IA.

| Fila | Concorrência | Papel |
| --- | ---: | --- |
| `inbound-webhooks` | 10 | Interpretar eventos e sincronização da Evolution. |
| `outbound-messages` | 5, limite 20/s | Enviar mensagens e confirmar efeitos posteriores. |
| `campaigns` | 10 | Distribuir campanhas e destinatários. |
| `automations` | 10 | Avançar inscrições de workflow. |
| `chatbots` | 5 | Executar nós, esperas e respostas automáticas. |
| `external-webhooks` | 5 | Entregar chamadas GET assinadas. |
| `task-digests` | 1 | Gerar o resumo diário das tarefas. |
| `transactional-emails` | 3 | Convites, recuperação e avisos internos. |
| `audio-transcriptions` | 1–3 | Transcrever áudio sem saturar o servidor. |
| `follow-ups` | 3 | Agendar e avançar sequências persistentes. |
| `ai-generations` | 1 | Serializar chamadas de LLM. |
| `ai-knowledge` | 2 | Indexar ou remover documentos do RAG. |

Jobs concluídos e falhos são limitados a 1.000 e 5.000 entradas no Redis. Operações críticas usam IDs determinísticos, tentativa exponencial e validação de estado no banco antes de executar.

### Reconciliação e operação contínua

Ao iniciar, o worker executa manutenção, recupera campanhas ativas, follow-ups, delays de chatbot, gerações de IA e documentos RAG pendentes. Depois mantém reconciliações leves:

- manutenção e campanhas a cada hora;
- follow-ups e esperas de chatbot a cada minuto;
- IA e documentos a cada 30 segundos;
- sincronização incremental da Evolution a cada cinco segundos, protegida por lock Redis `NX` de 30 segundos e liberação compare-and-delete.

O digest diário é agendado para 08:00 em `America/Sao_Paulo` e possui catch-up único se o worker iniciar depois desse horário. Manutenção recalcula aquecimento, remove sessões/idempotências vencidas, aplica retenção de IA e apaga mensagens antigas em lotes limitados.

Eventos concluídos são publicados no canal Redis `prospecta:realtime`, permitindo atualizar só a organização/conversa afetada. `SIGTERM` e `SIGINT` cancelam timers, fecham workers e filas, desconectam Prisma e encerram Redis antes da saída.

## 16. Infraestrutura e operação (`infrastructure`)

### Topologia de produção

O Compose principal executa web, API, MCP e worker junto a PostgreSQL, Redis, MinIO, Evolution e Speaches. Caddy é a única borda HTTP padrão: encaminha aplicação, `/api`, `/docs`, `/mcp`, Socket.IO e webhook Mailgun, aplicando compressão e cabeçalhos de segurança.

- A rede `app` é interna e contém todos os serviços. `edge` liga somente o Caddy à borda; `egress` libera saída apenas para API, worker, Evolution e transcrição.
- PostgreSQL, Redis e MinIO do CRM são separados dos equivalentes da Evolution, inclusive por credenciais e volumes.
- O MinIO do CRM publica a API apenas em loopback por padrão. A Evolution também expõe sua porta de desenvolvimento somente em `127.0.0.1` e nunca passa pelo proxy público.
- Dados persistem em volumes nomeados para bancos, filas, mídias, sessões da Evolution, modelos de transcrição e certificados do Caddy.
- API, MCP e web possuem healthcheck. Dependências de banco/Redis/MinIO aguardam saúde antes de iniciar; worker aguarda API saudável e serviços externos iniciados.

As imagens da aplicação usam builds multi-stage com pnpm congelado. Os runtimes de API, worker, MCP, web e Evolution executam como usuário sem privilégios. Um init container isolado ajusta permissões de volumes antigos da Evolution antes de liberar o serviço principal.

### Evolution customizada e serviços pesados

A imagem Evolution fixa o commit `cd800f…`, aplica patches locais de preview de links e estabilidade multi-instância e copia o build sobre a imagem 2.3.7. Sua persistência própria grava instâncias, mensagens, contatos e chats, mas não importa histórico.

Speaches roda em CPU com `faster-whisper-small`, baixa modelos no volume persistente e recebe prioridade menor de CPU. A IA generativa local foi removida: OpenAI é um serviço externo opcional, habilitado por variável e configuração organizacional.

### Desenvolvimento, rebuild e segurança HTTP

No desenvolvimento, o Compose adicional publica PostgreSQL em 5434, Redis em 6380, console MinIO e Evolution apenas no loopback. Vite expõe a SPA em 5173 e encaminha API/Socket localmente. Em produção, endereços do navegador permanecem relativos, permitindo trocar domínio sem recompilar URLs absolutas.

`rebuild.sh` valida Compose e `.env`, recusa pull sobre árvore rastreada suja, faz `git pull --ff-only`, reconstrói somente aplicação/MCP, aplica migrações e publica containers sem remover volumes. A Evolution só é reconstruída sob opção explícita. Se existir um override Tailscale no servidor, o script o incorpora e não sobe Caddy para evitar disputa de 80/443.

A API confia em um proxy, usa Helmet, compressão, CORS por allowlist, cookies e validação global com whitelist. O Caddy acrescenta `nosniff`, `SAMEORIGIN`, política de referrer e restringe câmera/geolocalização. O Content Security Policy do Helmet está explicitamente desativado.

### Backup e lacunas operacionais

O script atual gera dumps customizados dos dois PostgreSQL, compacta o volume MinIO do CRM, cria um `.tar.gz`, permite executar um comando externo de upload e remove arquivos locais com mais de 30 dias.

🔴 **LACUNA** — apesar de `BACKUP_ENCRYPTION_KEY` existir no exemplo e a documentação exigir backups criptografados, `scripts/backup.sh` não cifra o arquivo. Também não inclui o MinIO da Evolution, não implementa 12 cópias semanais e não há script de restauração/teste automático.

🟡 **RISCO** — o padrão `SPEACHES_IMAGE` usa tag `latest-cpu`, embora a orientação operacional recomende versões ou digests fixos em produção.

🟡 **RISCO** — não existe healthcheck próprio do worker; o Compose pode indicar o container como ativo sem comprovar que suas conexões Redis, banco e processadores continuam funcionais.

## Pendências desta etapa

O Arqueólogo concluiu os 16 módulos identificados pelo Scout. Lacunas confirmadas foram preservadas para o Detetive e o Arquiteto, sem alterar o sistema legado.

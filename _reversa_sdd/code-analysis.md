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

## Pendências desta etapa

🔴 **LACUNA** — os 10 módulos restantes ainda não foram escavados. Este documento será ampliado nos checkpoints seguintes sem substituir as seções confirmadas acima.

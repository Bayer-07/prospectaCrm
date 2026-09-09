# Base de conhecimento para agentes de IA

> Tipo: instruções de recuperação e resposta.
> Prioridade: usar este documento antes dos demais.

## Objetivo

Responder dúvidas sobre o uso do BZS One com precisão, usando os documentos desta pasta como fonte operacional. A wiki cobre a aplicação web, as regras de negócio observadas e as integrações disponíveis.

## Procedimento obrigatório do agente

1. Identifique a intenção: acesso, CRM, atendimento, follow-up, campanha, automação, IA, mídia, relatório ou integração.
2. Leia o documento principal indicado no índice do `README.md`.
3. Se a pergunta envolver uma ação, verifique pré-condições, permissão, estado atual e efeitos colaterais.
4. Responda com o caminho da interface e a regra aplicável.
5. Se houver mais de um significado para “encerrar”, “resolver”, “cancelar”, “concluir” ou “enviar”, peça a distinção ou explique cada resultado.
6. Nunca invente uma capacidade ausente. Use **[LACUNA]** e diga que a decisão precisa ser confirmada.
7. Para operações destrutivas, peça confirmação explícita antes de orientar o último passo.

## Formato recomendado de resposta

```text
Resultado: [o que acontece]
Caminho: [menu/tela/ação]
Pré-condições: [permissões, conexão, telefone, etc.]
Efeito: [registros ou mensagens afetados]
Exceções: [quando não acontece]
Fonte: [documento desta wiki]
```

## Entidades canônicas

| Entidade | Significado | Relações importantes |
|---|---|---|
| Organização | Tenant lógico do sistema. | Isola usuários, CRM, conversas e configurações. |
| Usuário | Pessoa que acessa e opera o sistema. | Tem papel, permissões, equipes e sessões. |
| Equipe/fila | Agrupamento de usuários e destino de atendimento. | Pode ser vinculada a conversas, contatos e oportunidades. |
| Empresa | Conta comercial ou organização prospectada. | Pode ter contatos e oportunidades. |
| Contato | Pessoa com telefone, e-mail e dados comerciais. | Pode pertencer a empresas e conversas. |
| Oportunidade | Negociação no pipeline. | Pertence a funil, etapa, empresa/contato e responsável. |
| Conversa | Atendimento associado ao contato e à instância WhatsApp. | Tem mensagens, status, responsável, equipe e follow-ups. |
| Mensagem | Entrada ou saída de uma conversa. | Pode ter mídia, resposta, reação, entrega e origem automática. |
| Atividade | Registro comercial de nota, ligação, reunião, tarefa, WhatsApp, e-mail ou sistema. | Pode apontar para empresa, contato e oportunidade. |
| Tarefa | Compromisso com título, prazo, prioridade e responsável. | Um follow-up automático possui uma tarefa vinculada. |
| Follow-up | Disparo automático agendado para uma conversa. | Possui sequência de mensagens ou workflow. |
| Campanha | Disparo em lote por WhatsApp ou e-mail. | Possui audiência congelada, destinatários e métricas. |
| Workflow | Automação publicada composta por etapas. | Executa inscrições para contatos. |
| Chatbot | Fluxo conversacional automático. | Possui sessões e pode transferir para humano. |
| Documento de conhecimento | Arquivo indexado para busca semântica da IA. | Passa por processamento antes de ficar disponível. |

## Estados que não devem ser confundidos

| Termo | Significado no BZS One |
|---|---|
| Fechar/resolver conversa | Muda o atendimento para `CLOSED`; não significa, por si só, cancelar um follow-up pendente. |
| Concluir tarefa | Marca a tarefa como concluída e cancela follow-up ativo vinculado. |
| Cancelar follow-up | Impede a execução futura e cancela etapas pendentes. |
| Responder ao follow-up | Uma resposta do contato antes do início cancela; durante a sequência interrompe o restante. |
| Reabrir conversa | Coloca o atendimento novamente em `OPEN`; pode ser feito por usuário ou pelo executor de follow-up. |
| Nova conversa | Novo atendimento lógico criado por evento de entrada quando não há conversa aberta elegível; não é o comportamento padrão do follow-up. |

## Regras gerais de segurança

- Não exponha senhas, cookies, chaves de API, segredos de webhook ou credenciais de provedores.
- Não trate o nome exibido como identificador confiável quando uma operação exige ID.
- Não diga que uma mensagem foi enviada apenas porque foi colocada em fila; diferencie `QUEUED`, `SENT`, `DELIVERED`, `READ` e `FAILED`.
- Não oriente exclusão física como se fosse reversível; várias exclusões são lógicas ou preservam histórico.
- Em dúvidas sobre escopo, considere `OWN` (próprios), `TEAM` (equipe) e `ALL` (todos).

## Regras para respostas sobre capacidade

- Se a regra estiver marcada **[CONFIRMADO]**, apresente como comportamento atual.
- Se estiver **[INFERIDO]**, informe que é uma interpretação do sistema e evite prometer.
- Se estiver **[LACUNA]**, não complete com suposição; encaminhe para validação do produto ou operação.
- Quando a pergunta for sobre uma alteração futura, separe “como funciona hoje” de “como deveria funcionar”.

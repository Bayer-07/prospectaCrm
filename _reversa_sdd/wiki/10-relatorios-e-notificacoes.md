# Relatórios, indicadores e notificações

> Rotas: `/relatorios`, `/` e notificações globais do Shell.
> Fonte de implementação: `apps/api/src/reports`, `apps/api/src/realtime`, `apps/web/src/pages/Reports.tsx`, `Dashboard.tsx`, `components/Shell.tsx`.

## Intenções atendidas

- Consultar desempenho comercial e de atendimento.
- Exportar ou gerar PDF quando disponível.
- Receber aviso de nova mensagem, falha ou conclusão.
- Entender por que uma tela atualizou sem recarregar.

## Dashboard e relatórios

O Dashboard resume dados dentro do escopo do usuário. **Relatórios** detalham indicadores e podem disponibilizar exportação/PDF. Filtros e períodos devem ser informados antes de comparar números; não compare um card de 7 dias com uma tabela de período diferente. **[CONFIRMADO]**

As métricas de campanhas, atendimento, tarefas, oportunidades e atividades são derivadas de registros persistidos. Uma mensagem apenas `QUEUED` não deve ser contada como enviada.

## Notificações

Notificações internas possuem destinatário, tipo, texto, data e status de leitura. Podem informar:

- nova mensagem;
- follow-up falho, cancelado ou interrompido;
- tarefa ou processamento relevante;
- geração de IA;
- outros eventos operacionais.

Marcar como lida remove o indicador, mas preserva o histórico necessário. **[CONFIRMADO]**

## Atualizações em tempo real

O navegador mantém canal Socket.IO autenticado e recebe eventos direcionados à organização/usuário. A aplicação invalida somente as consultas afetadas, por exemplo conversas, tarefas ou atividades; isso não significa que todos os dados foram recarregados. **[CONFIRMADO]**

Se a tela estiver desatualizada:

1. confirme se a sessão continua válida;
2. verifique o ícone/estado da conexão do navegador;
3. faça uma atualização manual;
4. se persistir, compare o registro na API/banco e consulte os logs do worker.

## Segurança

Um evento em tempo real não deve expor dados de outra organização nem de conversa fora do escopo. Relatórios, PDFs, mídias e webhooks devem respeitar a mesma fronteira de autorização. **[CONFIRMADO]**


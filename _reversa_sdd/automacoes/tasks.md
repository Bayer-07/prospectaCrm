# Automações — Tarefas de reconstrução

## Pré-requisitos

- [ ] Aplicar migrações, índices e estados enumerados deste módulo. **[CONFIRMADO]**
- [ ] Configurar somente no servidor as credenciais e URLs dos provedores necessários. **[CONFIRMADO]**
- [ ] Confirmar permissões dos papéis e equipes envolvidas. **[CONFIRMADO]**

## Implementação
- [ ] Reconstruir **Modelar e publicar automação** por `modelar-publicar/requirements.md`; pronto quando os efeitos, falhas e retomadas estiverem testados. **[INFERIDO]**
- [ ] Reconstruir **Inscrever contatos** por `inscrever-contatos/requirements.md`; pronto quando os efeitos, falhas e retomadas estiverem testados. **[INFERIDO]**
- [ ] Reconstruir **Executar ações** por `executar-acoes/requirements.md`; pronto quando os efeitos, falhas e retomadas estiverem testados. **[INFERIDO]**
- [ ] Recriar ids determinísticos, transações e guard clauses antes dos efeitos externos. **[CONFIRMADO]**
- [ ] Recriar eventos internos e Socket.IO sem incluir payload pesado nas listagens. **[INFERIDO]**

## Verificação

- [ ] Simular provedor offline, timeout, redelivery, reinício e concorrência. **[INFERIDO]**
- [ ] Confirmar que o navegador permanece utilizável durante o trabalho de fila. **[INFERIDO]**
- [ ] Medir consultas e índices com o volume alvo. **[A VALIDAR]**
- [ ] Executar typecheck, lint, testes e build dos pacotes afetados. **[INFERIDO]**

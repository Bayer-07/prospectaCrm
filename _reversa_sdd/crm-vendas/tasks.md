# CRM e vendas — Tarefas de reconstrução

## Pré-requisitos

- [ ] Aplicar schema e índices de CRM antes de importar dados. **[CONFIRMADO]**
- [ ] Confirmar permissões e escopos dos papéis padrão. **[CONFIRMADO]**
- [ ] Configurar armazenamento seguro para logos e propostas. **[CONFIRMADO]**

## Implementação

- [ ] Reconstruir **Empresas e contatos** conforme `empresas-contatos/requirements.md`; pronto quando requisitos, falhas e auditoria do caso passarem. **[INFERIDO]**
- [ ] Reconstruir **Pipeline e oportunidades** conforme `pipeline-oportunidades/requirements.md`; pronto quando requisitos, falhas e auditoria do caso passarem. **[INFERIDO]**
- [ ] Reconstruir **Tarefas e agenda** conforme `tarefas-agenda/requirements.md`; pronto quando requisitos, falhas e auditoria do caso passarem. **[INFERIDO]**
- [ ] Reconstruir **Importação e segmentação** conforme `importacao-segmentacao/requirements.md`; pronto quando requisitos, falhas e auditoria do caso passarem. **[INFERIDO]**
- [ ] Recriar filtros de escopo dentro das consultas, não apenas na interface. **[CONFIRMADO]**
- [ ] Recriar paginação por cursor e carregamento incremental de vinte contatos. **[CONFIRMADO]**
- [ ] Recriar eventos em tempo real somente para registros afetados. **[INFERIDO]**

## Verificação

- [ ] Testar 50 mil contatos, filtros combinados, cursores e deduplicação concorrente. **[INFERIDO]**
- [ ] Testar drag-and-drop de oportunidade e tarefa com rollback visual em falha. **[INFERIDO]**
- [ ] Testar importação CSV com encoding, colunas ausentes, linhas inválidas e duplicatas. **[INFERIDO]**
- [ ] Confirmar que exclusão lógica não remove histórico nem quebra relatórios. **[CONFIRMADO]**
- [ ] Executar typecheck, lint, testes e build de API, worker e web. **[INFERIDO]**

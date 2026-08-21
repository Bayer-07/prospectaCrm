# Empresas e contatos — Tarefas

- [ ] Implementar `CRM-1-FR-001`: Cadastrar empresa com CNPJ, nome, domínio, setor, porte, endereço, LinkedIn, logo, responsável, equipe e campos extensíveis. Pronto quando sucesso, autorização e falha estiverem testados. **[INFERIDO]**
- [ ] Implementar `CRM-1-FR-002`: Cadastrar contato com nome, cargo, e-mail, telefone normalizado, empresa, responsável, origem e bloqueio de campanhas. Pronto quando sucesso, autorização e falha estiverem testados. **[INFERIDO]**
- [ ] Implementar `CRM-1-FR-003`: Buscar dados públicos de empresa pelo CNPJ digitado e permitir revisão antes de salvar. Pronto quando sucesso, autorização e falha estiverem testados. **[INFERIDO]**
- [ ] Implementar `CRM-1-FR-004`: Importar contatos por CSV com modelo, mapeamento, prévia e erros por linha. Pronto quando sucesso, autorização e falha estiverem testados. **[INFERIDO]**
- [ ] Implementar `CRM-1-FR-005`: Mesclar duplicatas preservando associações e auditoria. Pronto quando sucesso, autorização e falha estiverem testados. **[INFERIDO]**

- [ ] Reutilizar normalizadores e verificadores de escopo do domínio, evitando regras divergentes entre rotas. **[CONFIRMADO]**
- [ ] Adicionar teste de concorrência para criação/transição quando houver risco de duplicidade. **[INFERIDO]**
- [ ] Medir a consulta principal com o volume alvo e revisar o plano do PostgreSQL. **[A VALIDAR]**
- [ ] Validar acessibilidade, teclado, estado vazio, carregamento e toast da interface. **[INFERIDO]**

## Definição de pronto

- [ ] Requisitos, design, contrato aplicável e código permanecem rastreáveis. **[INFERIDO]**
- [ ] Typecheck, lint, testes e build estão verdes. **[INFERIDO]**

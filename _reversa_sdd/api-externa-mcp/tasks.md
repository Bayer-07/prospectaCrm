# API externa e MCP — Tarefas de reconstrução

## Preparação

- [ ] Inventariar configuração obrigatória e opcional sem copiar segredos reais. **[CONFIRMADO]**
- [ ] Verificar dependências, versões fixadas, volumes e migrações. **[CONFIRMADO]**

## Implementação
- [ ] Reconstruir **Chaves e idempotência** por `chaves-idempotencia/requirements.md`; pronto quando fluxo, falha e isolamento forem testados. **[INFERIDO]**
- [ ] Reconstruir **API pública e Swagger** por `api-publica-swagger/requirements.md`; pronto quando fluxo, falha e isolamento forem testados. **[INFERIDO]**
- [ ] Reconstruir **Servidor MCP** por `servidor-mcp/requirements.md`; pronto quando fluxo, falha e isolamento forem testados. **[INFERIDO]**
- [ ] Preservar URLs relativas/configuráveis e falha fechada de segredos. **[CONFIRMADO]**
- [ ] Documentar comandos Ubuntu e atualização sem remoção de volumes. **[CONFIRMADO]**

## Validação

- [ ] Testar em ambiente limpo, rebuild, reinício e restauração. **[INFERIDO]**
- [ ] Verificar headers, portas, redes, permissões e ausência de segredo no build web. **[INFERIDO]**
- [ ] Executar typecheck, lint, testes, build e smoke test. **[INFERIDO]**

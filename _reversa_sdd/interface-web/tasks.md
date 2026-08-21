# Interface web — Tarefas de reconstrução

## Preparação

- [ ] Inventariar configuração obrigatória e opcional sem copiar segredos reais. **[CONFIRMADO]**
- [ ] Verificar dependências, versões fixadas, volumes e migrações. **[CONFIRMADO]**

## Implementação
- [ ] Reconstruir **Autenticação e navegação** por `autenticacao-navegacao/requirements.md`; pronto quando fluxo, falha e isolamento forem testados. **[INFERIDO]**
- [ ] Reconstruir **Busca e feedback** por `busca-feedback/requirements.md`; pronto quando fluxo, falha e isolamento forem testados. **[INFERIDO]**
- [ ] Reconstruir **Interações complexas** por `interacoes-complexas/requirements.md`; pronto quando fluxo, falha e isolamento forem testados. **[INFERIDO]**
- [ ] Reconstruir **Tema e movimento** por `tema-movimento/requirements.md`; pronto quando fluxo, falha e isolamento forem testados. **[INFERIDO]**
- [ ] Preservar URLs relativas/configuráveis e falha fechada de segredos. **[CONFIRMADO]**
- [ ] Documentar comandos Ubuntu e atualização sem remoção de volumes. **[CONFIRMADO]**

## Validação

- [ ] Testar em ambiente limpo, rebuild, reinício e restauração. **[INFERIDO]**
- [ ] Verificar headers, portas, redes, permissões e ausência de segredo no build web. **[INFERIDO]**
- [ ] Executar typecheck, lint, testes, build e smoke test. **[INFERIDO]**

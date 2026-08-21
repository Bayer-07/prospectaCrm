# Interface web — Requisitos

## Visão geral

Oferecer uma aplicação React/Vite responsiva, em português do Brasil, com tema escuro, navegação compacta e interações densas. **[CONFIRMADO]**

## Regras de negócio

1. A interface nunca substitui a autorização da API. **[CONFIRMADO]**
2. Erros e sucessos usam toast no canto superior direito por dois segundos, pausado no hover e com barra de progresso. **[CONFIRMADO]**
3. Ctrl+K abre busca global por empresas, contatos, oportunidades e conversas ativas. **[CONFIRMADO]**
4. Tema e preferências persistem no navegador ou perfil conforme seu escopo. **[CONFIRMADO]**
5. Telas de conversa e construtores usam altura disponível sem scroll global indevido. **[CONFIRMADO]**
6. Movimento respeita preferência reduced-motion e não desloca drag-and-drop do ponteiro. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| INTERFACE_WEB-FR-001 | Restaurar sessão, proteger rotas e oferecer menu lateral coerente com módulos e permissões. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| INTERFACE_WEB-FR-002 | Permitir localizar registros pelo teclado e comunicar resultados sem bloquear o fluxo do usuário. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| INTERFACE_WEB-FR-003 | Manter drag-and-drop, drawers, calendários, builders, composer e lightbox acessíveis e previsíveis. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| INTERFACE_WEB-FR-004 | Aplicar tokens visuais consistentes, tipografia legível e animações físicas discretas no padrão adotado. **[CONFIRMADO]** | Must | O fluxo autorizado conclui sem violar isolamento ou duplicar efeitos. **[INFERIDO]** |
| INTERFACE_WEB-FR-099 | Falhar de modo seguro quando configuração, dependência ou autorização obrigatória estiver ausente. **[CONFIRMADO]** | Must | Nenhum dado protegido ou efeito parcial é produzido. **[INFERIDO]** |

## Requisitos não funcionais

- Configuração varia por ambiente e nenhum endereço de desenvolvimento é fixado no código de domínio. **[CONFIRMADO]**
- Operações volumosas usam paginação, streaming, lote ou fila conforme sua natureza. **[INFERIDO]**
- Logs e respostas não expõem chaves, senhas, cookies ou URLs assinadas duradouras. **[CONFIRMADO]**
- A interface e os serviços opcionais degradam de forma isolada. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: operar interface web com configuração válida
  Dado que dependências, credenciais e permissões necessárias estão disponíveis
  Quando o caso de uso é executado
  Então o resultado é consistente e rastreável
  E nenhuma fronteira interna é exposta indevidamente
```
**[INFERIDO]**

## MoSCoW

- **Must:** regras, isolamento, segurança e casos de uso documentados. **[CONFIRMADO]**
- **Should:** healthcheck, observabilidade e recuperação orientada. **[INFERIDO]**
- **Could:** automação operacional adicional após métricas reais. **[A VALIDAR]**
- **Won’t:** depender de segredo ou IP hardcoded no repositório. **[CONFIRMADO]**

## Rastreabilidade

`apps/web/src/App.tsx`, `apps/web/src/components/AppShell.tsx`, `apps/web/src/api/client.ts`, `apps/web/src/styles.css`, `apps/web/src/interface-v2.css`, `apps/web/src/apple-ui.css`. **[CONFIRMADO]**

# CRM: empresas, contatos, oportunidades e segmentação

> Rotas: `/empresas`, `/contatos`, `/pipeline`.
> Fonte de implementação: `apps/api/src/crm`, `apps/web/src/pages/Companies.tsx`, `Contacts.tsx`, `Pipeline.tsx`.

## Intenções atendidas

- Cadastrar e localizar empresa ou contato.
- Evitar duplicidade de cadastro.
- Vincular contato e empresa.
- Criar e movimentar oportunidade no funil.
- Registrar tags, campos personalizados, propostas e segmentos.

## Empresas

Em **Empresas** é possível:

- buscar por nome, domínio ou CNPJ;
- filtrar por responsável, equipe, setor, porte e existência de contatos;
- cadastrar ou editar nome, razão social, CNPJ, telefone, domínio, LinkedIn, porte, setor e endereço;
- consultar CNPJ usando o serviço de enriquecimento disponível;
- definir ou remover logo;
- abrir detalhes com abas de visão geral, atividades, contatos e oportunidades;
- consultar contatos atribuídos e ações de telefone/e-mail.

CNPJ e domínio participam da deduplicação. Exclusões comerciais são lógicas e preservam histórico. **[CONFIRMADO]**

## Contatos

Em **Contatos** é possível:

- buscar por nome, telefone ou e-mail;
- filtrar por responsável, equipe, tag, empresa, telefone e e-mail;
- criar, editar e visualizar contato;
- associar uma ou mais empresas, com indicação de vínculo principal quando aplicável;
- importar contatos em lote por arquivo;
- iniciar conversa, ligar ou iniciar ação de e-mail quando houver dado de contato;
- consultar a timeline de atividades.

E-mails são normalizados. Telefones brasileiros equivalentes com ou sem o nono dígito não devem criar contatos ativos duplicados. **[CONFIRMADO]**

## Oportunidades e Pipeline

Em **Pipeline**:

1. Selecione o funil no seletor superior.
2. Use busca e filtros para localizar oportunidades.
3. Clique em **Nova oportunidade** para informar título, valor estimado e etapa.
4. Arraste o card para outra coluna para mudar a etapa.
5. Abra o card para consultar detalhes, responsáveis, empresa, contatos, tags, previsão e proposta.

O valor é armazenado em centavos. A mudança de etapa registra histórico com origem, destino, horário e ator. A oportunidade pertence a um funil e a uma etapa; a movimentação exige permissão e acesso ao destino. **[CONFIRMADO]**

## Propostas

No detalhe da oportunidade, a proposta pode ser:

- enviada como arquivo; ou
- cadastrada como link externo.

O arquivo é armazenado como mídia protegida. O link é aberto em nova aba e deve ser validado pelo usuário antes do envio. **[CONFIRMADO]**

## Tags, campos e segmentos

Tags são marcadores reutilizáveis para filtrar contatos e demais registros conforme a tela. Campos personalizados permitem dados adicionais definidos na organização. Segmentos representam audiências reutilizáveis, especialmente úteis em campanhas e consultas comerciais. **[CONFIRMADO]**

## Busca, paginação e escopo

Listagens grandes usam busca, filtros e paginação por cursor. O usuário pode receber apenas registros próprios, da equipe ou da organização, de acordo com a permissão. A ausência de um registro pode ser escopo e não exclusão. **[CONFIRMADO]**

## Erros comuns

| Sintoma | Causa provável | Ação |
|---|---|---|
| Cadastro recusado como duplicado | CNPJ, domínio, e-mail ou telefone equivalente já existe. | Abra o registro existente e confirme se deve reutilizá-lo. |
| Oportunidade não aparece | Busca, funil, etapa ou escopo filtrando o resultado. | Limpe filtros e confirme o funil selecionado. |
| Não consigo editar | Falta de `write` ou escopo incompatível. | Solicite ao administrador a permissão correta. |
| Logo/proposta não abre | Mídia privada, link expirado ou falha de armazenamento. | Recarregue; se persistir, verificar o armazenamento. |

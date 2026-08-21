# História de usuário — CRM e pipeline

## Narrativa

Como profissional comercial, quero registrar empresas, contatos e oportunidades e movimentá-las no pipeline para acompanhar todo o ciclo de venda. **[INFERIDO]**

## Valor

Esta jornada reduz trabalho manual e mantém autorização, rastreabilidade e estado persistente como condições do resultado. **[INFERIDO]**

## Critérios de aceite
1. Cadastros equivalentes não geram duplicata ativa. **[CONFIRMADO]**
2. Listagens filtram e carregam incrementalmente. **[CONFIRMADO]**
3. Arrastar um card muda a etapa e registra histórico. **[CONFIRMADO]**
4. Tarefas e propostas permanecem vinculadas à oportunidade. **[CONFIRMADO]**

## Cenário integrado

```gherkin
Funcionalidade: CRM e pipeline
  Cenário: concluir a jornada principal
    Dado que o usuário está autenticado e possui as permissões necessárias
    E as dependências obrigatórias estão disponíveis
    Quando ele conclui a jornada descrita
    Então o estado comercial fica persistido e rastreável
    E uma repetição técnica não duplica o efeito
```
**[INFERIDO]**

## Fora do escopo

- Elevação de privilégio pela interface ou acesso cruzado entre organizações. **[CONFIRMADO]**
- Uso de segredo externo no navegador. **[CONFIRMADO]**

## Especificações relacionadas

- `_reversa_sdd/crm-vendas/requirements.md`. **[CONFIRMADO]**
- `_reversa_sdd/crm-vendas/pipeline-oportunidades/requirements.md`. **[CONFIRMADO]**

# História de usuário — IA e conhecimento

## Narrativa

Como atendente, quero resumir conversas e receber sugestões fundamentadas nos documentos da empresa sem perder controle sobre o envio e o CRM. **[INFERIDO]**

## Valor

Esta jornada reduz trabalho manual e mantém autorização, rastreabilidade e estado persistente como condições do resultado. **[INFERIDO]**

## Critérios de aceite
1. Sugestão nunca é enviada sozinha nem sobrescreve texto digitado. **[CONFIRMADO]**
2. Resumo indica escopo e fica obsoleto quando o contexto muda. **[CONFIRMADO]**
3. RAG recupera somente documentos autorizados da organização e mostra fontes. **[CONFIRMADO]**
4. Propostas de alteração exigem aprovação humana. **[CONFIRMADO]**

## Cenário integrado

```gherkin
Funcionalidade: IA e conhecimento
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

- `_reversa_sdd/ia-conhecimento/requirements.md`. **[CONFIRMADO]**
- `_reversa_sdd/ia-conhecimento/rag-documental/requirements.md`. **[CONFIRMADO]**

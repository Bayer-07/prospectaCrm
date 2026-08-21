# História de usuário — Follow-ups

## Narrativa

Como atendente, quero agendar mensagens ou uma automação futura e vê-la como tarefa na agenda para cumprir compromissos sem acompanhamento manual. **[INFERIDO]**

## Valor

Esta jornada reduz trabalho manual e mantém autorização, rastreabilidade e estado persistente como condições do resultado. **[INFERIDO]**

## Critérios de aceite
1. Existe um follow-up ativo por conversa. **[CONFIRMADO]**
2. Mover a tarefa antes do início reagenda o disparo real. **[CONFIRMADO]**
3. Resposta do cliente cancela ou interrompe o restante. **[CONFIRMADO]**
4. Servidor reiniciado recupera o job sem duplicar ou enviar após a tolerância. **[CONFIRMADO]**

## Cenário integrado

```gherkin
Funcionalidade: Follow-ups
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

- `_reversa_sdd/follow-ups/requirements.md`. **[CONFIRMADO]**
- `_reversa_sdd/follow-ups/interromper-recuperar/requirements.md`. **[CONFIRMADO]**

# História de usuário — Atendimento pelo WhatsApp

## Narrativa

Como atendente, quero assumir tickets, trocar mensagens e encerrar atendimentos usando os números autorizados da empresa. **[INFERIDO]**

## Valor

Esta jornada reduz trabalho manual e mantém autorização, rastreabilidade e estado persistente como condições do resultado. **[INFERIDO]**

## Critérios de aceite
1. Mensagem nova sem responsável cria ticket aguardando. **[CONFIRMADO]**
2. Assumir ou reabrir transfere o ticket ao operador atual. **[CONFIRMADO]**
3. Mídias, respostas, reações, recibos, edições e exclusões são representados. **[CONFIRMADO]**
4. Finalizar mantém minha aba de trabalho e move o ticket em segundo plano. **[CONFIRMADO]**

## Cenário integrado

```gherkin
Funcionalidade: Atendimento pelo WhatsApp
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

- `_reversa_sdd/whatsapp-inbox/requirements.md`. **[CONFIRMADO]**
- `_reversa_sdd/whatsapp-inbox/mensagens-midias/requirements.md`. **[CONFIRMADO]**

# História de usuário — Campanhas

## Narrativa

Como responsável por prospecção, quero selecionar uma audiência e executar campanhas de WhatsApp ou e-mail com métricas confiáveis. **[INFERIDO]**

## Valor

Esta jornada reduz trabalho manual e mantém autorização, rastreabilidade e estado persistente como condições do resultado. **[INFERIDO]**

## Critérios de aceite
1. Busca e CSV produzem prévia de válidos e inválidos. **[CONFIRMADO]**
2. Contato bloqueado para campanhas nunca recebe WhatsApp nem e-mail. **[CONFIRMADO]**
3. Destinatário sem WhatsApp é ignorado e contado como concluído. **[CONFIRMADO]**
4. Pausa, retomada e campanhas paralelas não duplicam envios. **[CONFIRMADO]**

## Cenário integrado

```gherkin
Funcionalidade: Campanhas
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

- `_reversa_sdd/campanhas-email/requirements.md`. **[CONFIRMADO]**
- `_reversa_sdd/campanhas-email/ciclo-campanha/requirements.md`. **[CONFIRMADO]**

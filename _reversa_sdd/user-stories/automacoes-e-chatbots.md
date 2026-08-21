# História de usuário — Automações e chatbots

## Narrativa

Como gestor, quero modelar fluxos visuais versionados para automatizar ações e pré-atender clientes com handoff seguro. **[INFERIDO]**

## Valor

Esta jornada reduz trabalho manual e mantém autorização, rastreabilidade e estado persistente como condições do resultado. **[INFERIDO]**

## Critérios de aceite
1. Rascunho é editável e versão publicada é imutável. **[CONFIRMADO]**
2. Automação rejeita ciclos; chatbot aceita ciclos controlados. **[CONFIRMADO]**
3. Esperas persistem e retomam após reinício. **[CONFIRMADO]**
4. Falha ou baixa confiança da IA transfere para humano. **[CONFIRMADO]**

## Cenário integrado

```gherkin
Funcionalidade: Automações e chatbots
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

- `_reversa_sdd/automacoes/requirements.md`. **[CONFIRMADO]**
- `_reversa_sdd/chatbots/requirements.md`. **[CONFIRMADO]**

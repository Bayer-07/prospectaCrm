# História de usuário — API e MCP

## Narrativa

Como integrador, quero ler, criar e editar dados autorizados por REST ou MCP com documentação suficiente e sem operações destrutivas no MCP. **[INFERIDO]**

## Valor

Esta jornada reduz trabalho manual e mantém autorização, rastreabilidade e estado persistente como condições do resultado. **[INFERIDO]**

## Critérios de aceite
1. Swagger expõe somente recursos públicos e descreve seus atributos. **[CONFIRMADO]**
2. Idempotency-Key evita duplicação de criações sensíveis. **[CONFIRMADO]**
3. MCP anuncia apenas ferramentas implementadas. **[CONFIRMADO]**
4. MCP nunca oferece exclusão e respeita cursores e escopos. **[CONFIRMADO]**

## Cenário integrado

```gherkin
Funcionalidade: API e MCP
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

- `_reversa_sdd/api-externa-mcp/requirements.md`. **[CONFIRMADO]**
- `_reversa_sdd/openapi/bzs-one.yaml`. **[CONFIRMADO]**

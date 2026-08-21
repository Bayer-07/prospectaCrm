# ADR 004 — Evolution API isolada e imagem customizada fixada

- **Status:** aceito (retroativo)
- **Data reconstruída:** 2026-07-17, revisado em 2026-08-19
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commits `81d91ff`, `5acb943`

## Contexto

O WhatsApp por QR/Baileys é uma integração externa instável, com sessões, mídia, webhooks e múltiplos números. O navegador não pode receber credenciais da Evolution, e estados de instâncias não podem se contaminar.

## Decisão

- Executar Evolution em serviço e banco/Redis/MinIO próprios.
- Expor a Evolution somente internamente/loopback; API do BZS One é o gateway.
- Criptografar a credencial por instância no banco do CRM.
- Configurar webhook individual por instância e processar eventos por fila idempotente.
- Construir imagem Evolution customizada e fixada (`bzs-one/evolution-api:2.3.7-link-preview`) para compatibilidade de previews e comportamento validado.
- Tratar estado, reparo, QR e remoção por `instanceKey` específico.

## Consequências

### Positivas

- Falha ou dado de uma conexão não deveria atualizar as demais.
- Segredos e endpoints internos não chegam ao frontend.
- A imagem validada evita mudança silenciosa de versão upstream.

### Negativas

- A equipe mantém patch/imagem própria e precisa atualizar conscientemente.
- QR/Baileys continua sem garantia operacional do WhatsApp Business oficial.
- Mais serviços de persistência aumentam backup e observabilidade necessários.

## Alternativas consideradas

- Cloud API oficial: maior previsibilidade, mas modelo de templates/custos e migração incompatíveis com a operação QR escolhida.
- Uma instância Evolution compartilhada sem separação de chave: causou/permitiria contaminação entre números.
- Consumir Evolution direto do navegador: rejeitado por segurança.

## Evidências atuais

`infra/evolution/Dockerfile`, `docker-compose.yml`, `apps/api/src/integrations/evolution.service.ts`, `apps/worker/src/inbound.processor.ts`.

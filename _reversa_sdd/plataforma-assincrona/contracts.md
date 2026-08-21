# Plataforma assíncrona — Contratos

## Fronteiras

- Entradas externas atravessam proxy e autenticação antes do domínio. **[CONFIRMADO]**
- Serviços internos usam DNS da rede Docker e não publicam portas sem necessidade operacional. **[CONFIRMADO]**
- Configurações obrigatórias ausentes interrompem o serviço ou recurso de forma explícita. **[CONFIRMADO]**

## Interfaces

- `BullMQ campaign`. **[CONFIRMADO]**
- `BullMQ inbound`. **[CONFIRMADO]**
- `BullMQ workflows`. **[CONFIRMADO]**
- `BullMQ chatbots`. **[CONFIRMADO]**
- `BullMQ follow-ups`. **[CONFIRMADO]**
- `BullMQ ai-generations`. **[CONFIRMADO]**
- `BullMQ transcription`. **[CONFIRMADO]**
- `BullMQ external-webhooks`. **[CONFIRMADO]**

## Compatibilidade

- Mudanças de rota, porta, variável, volume, payload ou ferramenta anunciada exigem atualização coordenada de consumidores e documentação. **[INFERIDO]**
- Segredos são valores de implantação, nunca defaults funcionais do contrato. **[CONFIRMADO]**

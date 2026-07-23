# Operação e implantação

## Requisitos

- VPS Linux com Docker Engine e Compose, 4 vCPU, 8 GB de RAM e SSD a partir de 120 GB.
- Domínio apontando para a VPS e portas 80/443 liberadas.
- Armazenamento S3 externo para backups criptografados.
- Número exclusivo para homologar a Evolution API.

## Produção

1. Copie `.env.example` para `.env` e substitua todos os segredos.
2. Defina `APP_ADDRESS` com o domínio, por exemplo `crm.empresa.com.br`.
3. Use senhas distintas nos dois PostgreSQL e nos dois Redis.
4. Execute `docker compose build` e `docker compose up -d`.
5. Execute o seed uma única vez e depois `bootstrap:admin` com as variáveis do administrador.
6. Valide `/health`, `/docs`, login, permissões e um número de homologação antes de cadastrar números reais.

A Evolution API fica apenas na rede interna. A imagem padrão usa a versão estável
`v2.3.7`; a família 2.4 deve ser adotada somente após sair de pré-lançamento,
concluir a ativação de licença e passar pelos testes contratuais.

## Backup e restauração

Agende `scripts/backup.sh` diariamente. A variável `BACKUP_UPLOAD_COMMAND` deve
enviar o arquivo para o armazenamento externo. Mantenha 30 cópias diárias e 12
semanais. Faça um ensaio trimestral de restauração em uma VPS isolada.

## Atualizações

- Fixe imagens por versão ou digest; nunca use `latest` em produção.
- Faça backup antes de atualizar o CRM, PostgreSQL ou Evolution API.
- Teste webhooks, envio de texto/mídia, QR, status de entrega e opt-out no número
  de homologação.
- Atualizações da Evolution 2.4+ exigem verificar o fluxo de licenciamento.

## Incidentes

- Pause campanhas ao primeiro aumento de desconexões ou falhas.
- Revogue chaves de API expostas e gere novas credenciais.
- Consulte a fila de falhas e os registros de auditoria antes de reprocessar.
- Não aumente limites de aquecimento para compensar bloqueios do WhatsApp.

# Acesso, usuários, permissões e navegação

> Rotas da interface: `/login`, `/recuperar-senha`, `/aceitar-convite`, `/redefinir-senha`, `/configuracoes`.
> Fonte de implementação: `apps/api/src/auth`, `apps/api/src/users`, `apps/web/src/pages/Auth.tsx`, `apps/web/src/pages/Settings.tsx`.

## Intenções atendidas

- Entrar ou sair do sistema.
- Recuperar uma senha esquecida.
- Aceitar convite de usuário.
- Entender por que uma tela ou ação não aparece.
- Convidar usuários, configurar equipes e administrar papéis.

## Entrar

1. Abra a aplicação e informe e-mail e senha.
2. Com credenciais válidas, o sistema cria uma sessão de navegador.
3. A interface carrega o menu e as rotas permitidas pelo usuário.

O login normaliza o e-mail e devolve uma mensagem genérica para e-mail inexistente, usuário inativo ou senha incorreta. Cinco falhas no intervalo de quinze minutos bloqueiam novas tentativas no escopo de proteção. **[CONFIRMADO]**

## Recuperar senha

1. Na tela de login, escolha **Esqueci minha senha**.
2. Informe o e-mail.
3. Abra o link recebido e defina uma nova senha.

O pedido não revela se o e-mail existe. O token expira em 60 minutos; a senha precisa ter pelo menos cinco caracteres. **[CONFIRMADO]**

## Convite

Um administrador ou usuário autorizado abre **Configurações → Usuários → Convidar usuário**, informa nome, e-mail, papel e equipes opcionais. O link enviado por e-mail é válido por 72 horas e só pode ser usado uma vez. **[CONFIRMADO]**

## Menu principal

| Tela | Caminho | Uso |
|---|---|---|
| Visão geral | `/` | Indicadores, saúde do funil, tarefas e atendimento. |
| Pipeline | `/pipeline` | Oportunidades em Kanban. |
| Empresas | `/empresas` | Contas comerciais, contatos vinculados e dados cadastrais. |
| Contatos | `/contatos` | Pessoas, filtros, importação e ações de contato. |
| Tarefas | `/tarefas` | Calendário de tarefas e follow-ups. |
| Atividades | `/atividades` | Histórico de notas, ligações, reuniões, mensagens e tarefas. |
| Inbox | `/inbox` | Atendimento e mensagens de WhatsApp. |
| Respostas rápidas | `/respostas-rapidas` | Textos e anexos reutilizáveis. |
| Campanhas | `/campanhas` | Campanhas de WhatsApp. |
| Chatbots | `/chatbots` | Fluxos automáticos de atendimento. |
| Automações | `/automacoes` | Workflows publicados. |
| Relatórios | `/relatorios` | Indicadores e exportações. |
| E-mail | `/email` | Modelos e campanhas de e-mail. |
| Conexões | `/conexoes` | Números WhatsApp e QR Code. |
| Configurações | `/configuracoes` | Usuários, equipes e papéis. |
| Integrações | `/integracoes/...` | IA, API, MCP, webhooks e Swagger. |

As rotas são protegidas. A ausência de uma opção pode ser consequência de permissão, escopo, estado do recurso ou carregamento, e não necessariamente de erro. **[CONFIRMADO]**

## Permissões e escopos

Cada permissão combina recurso, ação e escopo:

- `read`: consultar.
- `write`: criar ou alterar.
- `launch`: iniciar campanhas, quando aplicável.
- `OWN`: registros próprios ou atribuídos ao usuário.
- `TEAM`: registros da equipe.
- `ALL`: registros da organização.
- `NONE`: sem acesso.

A API sempre repete a validação. O frontend pode esconder botões, mas não é a barreira de segurança. **[CONFIRMADO]**

## Sessão e preferências

A sessão humana expira em sete dias. Cookies de sessão são `HttpOnly`; o token CSRF é validado nas mutações. O tema e algumas preferências da interface são mantidos no navegador ou no perfil conforme a configuração. **[CONFIRMADO]**

Atalhos e conveniências:

- `Ctrl+K`: busca global por empresas, contatos, oportunidades e conversas ativas.
- Tema claro/escuro: alternância da interface.
- Toasts no canto superior direito: confirmam sucesso ou mostram falha.

## Administração

Em **Configurações**:

- **Usuários**: convidar, editar e desativar usuários.
- **Equipes e filas**: criar equipes, escolher cor e associar usuários.
- **Papéis e permissões**: configurar leitura, alteração, escopo e lançamento de campanhas.

A exclusão de usuário é desativação lógica para preservar histórico. O sistema não confirma uma política automática de reatribuição de todos os registros ao desativar alguém; trate isso como **[LACUNA]** operacional.

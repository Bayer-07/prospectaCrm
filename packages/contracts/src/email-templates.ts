export type BrandedEmailCallToAction = {
  label: string;
  href: string;
};

export type BrandedEmailLayoutInput = {
  preheader: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  callToAction?: BrandedEmailCallToAction;
  brandLabel?: string;
  footerText?: string;
  includeUnsubscribe?: boolean;
};

export type DefaultEmailTemplate = {
  name: string;
  subject: string;
  html: string;
  text: string;
};

export type UserInviteEmailJob = {
  inviteTokenId: string;
  inviteUrl: string;
  expiresInHours: number;
};

export type UserInviteEmailInput = {
  recipientName: string;
  inviterName: string;
  organizationName: string;
  roleName: string;
  inviteUrl: string;
  expiresInHours: number;
};

export type PasswordResetEmailJob = {
  passwordResetTokenId: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export type PasswordResetEmailInput = {
  recipientName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export type FollowUpAlertEmailJob = {
  followUpId: string;
  reason: 'contact_replied_before_start' | 'execution_failed';
};

const SGA_URL = 'https://www.bzs.com.br/solucoes/controle-agua-e-gas/17';

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] || character);
}

/**
 * Estrutura híbrida para e-mail: os estilos essenciais ficam inline e a
 * media query apenas aprimora o layout em telas pequenas. `bodyHtml` deve ser
 * montado somente com conteúdo confiável ou previamente escapado.
 */
export function renderBzsEmailLayout(input: BrandedEmailLayoutInput) {
  const brandLabel = input.brandLabel || 'BZS TECNOLOGIA';
  const eyebrow = input.eyebrow || 'CONTROLE DE ÁGUA E GÁS';
  const footerText = input.footerText || 'Tecnologia para uma gestão mais clara, segura e eficiente.';
  const callToAction = input.callToAction
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px">
        <tr>
          <td style="border-radius:8px;background:#2fa9dd">
            <a href="${escapeEmailHtml(input.callToAction.href)}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${escapeEmailHtml(input.callToAction.label)}</a>
          </td>
        </tr>
      </table>`
    : '';
  const unsubscribe = input.includeUnsubscribe
    ? `<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#84919a">
        Se não quiser mais receber estes e-mails, <a href="%unsubscribe_url%" style="color:#61717c;text-decoration:underline">cancele sua inscrição</a>.
      </p>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeEmailHtml(input.title)}</title>
    <style>
      @media only screen and (max-width:620px) {
        .bzs-shell { width:100% !important; }
        .bzs-outer { padding:12px 0 !important; }
        .bzs-header { padding:24px 20px !important; }
        .bzs-content { padding:26px 20px !important; }
        .bzs-title { font-size:27px !important; line-height:33px !important; }
        .bzs-feature { display:block !important; width:100% !important; box-sizing:border-box !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#eef3f5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
    <div data-email-preheader="true" style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeEmailHtml(input.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#eef3f5">
      <tr>
        <td class="bzs-outer" align="center" style="padding:28px 16px">
          <table class="bzs-shell" role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;border-collapse:separate;background:#ffffff;border:1px solid #dce5e9;border-radius:14px;overflow:hidden">
            <tr>
              <td style="height:5px;background:#2fa9dd;font-size:0;line-height:0">&nbsp;</td>
            </tr>
            <tr>
              <td class="bzs-header" style="padding:28px 34px 26px;background:#122d3a">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:800;letter-spacing:.08em;color:#ffffff">${escapeEmailHtml(brandLabel)}</td>
                    <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.08em;color:#70ccee">${escapeEmailHtml(eyebrow)}</td>
                  </tr>
                </table>
                <h1 class="bzs-title" style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:39px;font-weight:750;color:#ffffff">${escapeEmailHtml(input.title)}</h1>
              </td>
            </tr>
            <tr>
              <td class="bzs-content" style="padding:34px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#33434c">
                ${input.bodyHtml}
                ${callToAction}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 34px;background:#f5f8f9;border-top:1px solid #e1e8eb;font-family:Arial,Helvetica,sans-serif">
                <p style="margin:0;font-size:12px;line-height:18px;color:#60717b">${escapeEmailHtml(footerText)}</p>
                <p style="margin:6px 0 0;font-size:12px;line-height:18px;color:#60717b">
                  <a href="https://www.bzs.com.br" style="color:#168cbe;text-decoration:none;font-weight:700">bzs.com.br</a>
                  &nbsp;·&nbsp;
                  <a href="mailto:bzs@bzs.com.br" style="color:#168cbe;text-decoration:none">bzs@bzs.com.br</a>
                </p>
                ${unsubscribe}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderUserInviteEmail(input: UserInviteEmailInput) {
  const subject = 'Você foi convidado para acessar o BZS One';
  const expiration = `${input.expiresInHours} horas`;
  const html = renderBzsEmailLayout({
    preheader: `${input.inviterName} convidou você para fazer parte do BZS One.`,
    eyebrow: 'ACESSO SEGURO',
    brandLabel: 'BZS ONE',
    title: 'Seu acesso está pronto',
    bodyHtml: `
      <p style="margin:0 0 18px">Olá, <strong style="color:#182a33">${escapeEmailHtml(input.recipientName)}</strong>.</p>
      <p style="margin:0 0 22px">
        <strong style="color:#182a33">${escapeEmailHtml(input.inviterName)}</strong> convidou você para acessar o
        <strong style="color:#182a33">BZS One</strong>, o ambiente interno da ${escapeEmailHtml(input.organizationName)}.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 22px;border-collapse:separate;border-spacing:0;background:#f5f8f9;border:1px solid #dfe8ec;border-radius:10px">
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #dfe8ec;color:#66727d">Organização</td>
          <td align="right" style="padding:14px 16px;border-bottom:1px solid #dfe8ec;font-weight:700;color:#20262c">${escapeEmailHtml(input.organizationName)}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;color:#66727d">Perfil de acesso</td>
          <td align="right" style="padding:14px 16px;font-weight:700;color:#20262c">${escapeEmailHtml(input.roleName)}</td>
        </tr>
      </table>
      <p style="margin:0 0 10px">Use o botão abaixo para criar sua senha e ativar a conta. O convite é pessoal e expira em <strong style="color:#182a33">${escapeEmailHtml(expiration)}</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0 0;border-collapse:collapse">
        <tr>
          <td style="padding:14px 16px;border-left:4px solid #2fa9dd;border-radius:0 8px 8px 0;background:#f0f8fb;color:#52646e;font-size:13px;line-height:20px">
            Por segurança, não encaminhe este e-mail. Se você não esperava o convite, ignore a mensagem; nenhuma conta será ativada.
          </td>
        </tr>
      </table>`,
    callToAction: { label: 'Aceitar convite', href: input.inviteUrl },
    footerText: 'Mensagem transacional de acesso ao BZS One. Este e-mail não é uma campanha comercial.',
  });
  const text = [
    `Olá, ${input.recipientName}.`,
    '',
    `${input.inviterName} convidou você para acessar o BZS One, o ambiente interno da ${input.organizationName}.`,
    `Perfil de acesso: ${input.roleName}.`,
    '',
    `Crie sua senha e ative a conta: ${input.inviteUrl}`,
    '',
    `Este convite é pessoal e expira em ${expiration}.`,
    'Se você não esperava o convite, ignore esta mensagem; nenhuma conta será ativada.',
  ].join('\n');
  return { subject, html, text };
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput) {
  const subject = 'Redefina sua senha no BZS One';
  const expiration = `${input.expiresInMinutes} minutos`;
  const html = renderBzsEmailLayout({
    preheader: 'Recebemos uma solicitação para redefinir sua senha no BZS One.',
    eyebrow: 'SEGURANÇA DA CONTA',
    brandLabel: 'BZS ONE',
    title: 'Redefinição de senha',
    bodyHtml: `
      <p style="margin:0 0 18px">Olá, <strong style="color:#182a33">${escapeEmailHtml(input.recipientName)}</strong>.</p>
      <p style="margin:0 0 20px">Recebemos uma solicitação para criar uma nova senha para sua conta no <strong style="color:#182a33">BZS One</strong>.</p>
      <p style="margin:0 0 10px">Use o botão abaixo para continuar. O link é pessoal, pode ser utilizado apenas uma vez e expira em <strong style="color:#182a33">${escapeEmailHtml(expiration)}</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0 0;border-collapse:collapse">
        <tr>
          <td style="padding:14px 16px;border-left:4px solid #2fa9dd;border-radius:0 8px 8px 0;background:#f0f8fb;color:#52646e;font-size:13px;line-height:20px">
            Se você não solicitou a redefinição, ignore este e-mail. Sua senha atual continuará funcionando e nenhuma alteração será realizada.
          </td>
        </tr>
      </table>`,
    callToAction: { label: 'Redefinir minha senha', href: input.resetUrl },
    footerText: 'Mensagem transacional de segurança do BZS One. Este e-mail não é uma campanha comercial.',
  });
  const text = [
    `Olá, ${input.recipientName}.`,
    '',
    'Recebemos uma solicitação para criar uma nova senha para sua conta no BZS One.',
    `Redefina sua senha: ${input.resetUrl}`,
    '',
    `Este link é pessoal, pode ser utilizado apenas uma vez e expira em ${expiration}.`,
    'Se você não solicitou a redefinição, ignore este e-mail. Sua senha atual continuará funcionando.',
  ].join('\n');
  return { subject, html, text };
}

function paragraph(content: string, style = '') {
  return `<p style="margin:0 0 18px;${style}">${content}</p>`;
}

function featureList(items: Array<{ title: string; description: string }>) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:22px 0;border-collapse:separate;border-spacing:0 10px">
    ${items.map((item) => `<tr>
      <td width="32" valign="top" style="width:32px;padding-top:2px">
        <span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:#dff3fb;color:#168cbe;text-align:center;font-size:13px;line-height:22px;font-weight:800">✓</span>
      </td>
      <td valign="top" style="padding:0 0 0 4px">
        <strong style="display:block;margin:0 0 2px;color:#182a33">${item.title}</strong>
        <span style="display:block;color:#5e6d76">${item.description}</span>
      </td>
    </tr>`).join('')}
  </table>`;
}

function highlight(content: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:22px 0;border-collapse:collapse">
    <tr>
      <td style="padding:17px 18px;border-left:4px solid #2fa9dd;border-radius:0 8px 8px 0;background:#f0f8fb;color:#26414d">${content}</td>
    </tr>
  </table>`;
}

function closing() {
  return paragraph('Se fizer sentido para sua operação, basta responder este e-mail. Nossa equipe continua a conversa a partir da sua realidade.', 'margin-top:24px;');
}

export const sgaProspectingEmailTemplates: readonly DefaultEmailTemplate[] = [
  {
    name: 'SGA · 01 Primeiro contato',
    subject: '{{nome}}, sua gestão de água e gás pode ser mais simples',
    html: renderBzsEmailLayout({
      preheader: 'Centralize leitura, cálculo, faturamento e cobrança em uma só rotina.',
      title: 'Menos controles manuais. Mais clareza para gerir.',
      bodyHtml: [
        paragraph('Olá, <strong style="color:#182a33">{{nome}}</strong>.'),
        paragraph('Quando leitura, cálculo, faturamento e cobrança ficam espalhados entre planilhas e processos manuais, a equipe perde tempo conferindo informações e corrigindo retrabalho.'),
        paragraph('O <strong style="color:#182a33">SGA da BZS Tecnologia</strong> organiza essas etapas em um único sistema em nuvem, facilitando o acompanhamento da operação de água e gás do início ao fim.'),
        featureList([
          { title: 'Fluxo centralizado', description: 'Leituras, cálculos, faturas e cobranças no mesmo processo.' },
          { title: 'Informação rastreável', description: 'Histórico organizado para consultas e conferências.' },
          { title: 'Visão da operação', description: 'Dados mais acessíveis para acompanhar a rotina e decidir.' },
        ]),
        closing(),
      ].join(''),
      callToAction: { label: 'Conhecer o SGA', href: SGA_URL },
      includeUnsubscribe: true,
    }),
    text: `Olá, {{nome}}.

Quando leitura, cálculo, faturamento e cobrança ficam espalhados entre planilhas e processos manuais, a equipe perde tempo conferindo informações e corrigindo retrabalho.

O SGA da BZS Tecnologia organiza essas etapas em um único sistema em nuvem, facilitando o acompanhamento da operação de água e gás do início ao fim.

- Fluxo centralizado: leituras, cálculos, faturas e cobranças no mesmo processo.
- Informação rastreável: histórico organizado para consultas e conferências.
- Visão da operação: dados mais acessíveis para acompanhar a rotina e decidir.

Conheça o SGA: ${SGA_URL}

Se fizer sentido para sua operação, basta responder este e-mail.

Cancelar inscrição: %unsubscribe_url%`,
  },
  {
    name: 'SGA · 02 Redução de retrabalho',
    subject: 'Quanto tempo sua equipe perde conferindo leituras e faturas?',
    html: renderBzsEmailLayout({
      preheader: 'Uma rotina integrada reduz etapas repetidas e melhora a conferência.',
      title: 'A operação não precisa depender de trabalho dobrado.',
      bodyHtml: [
        paragraph('Olá, <strong style="color:#182a33">{{nome}}</strong>.'),
        paragraph('Conferir leituras em uma planilha, calcular em outra ferramenta e depois transportar os dados para faturamento cria pontos de falha e consome horas da equipe.'),
        highlight('<strong style="color:#182a33">A proposta do SGA é simples:</strong> transformar essas etapas em um fluxo contínuo, com as informações disponíveis no mesmo ambiente.'),
        featureList([
          { title: 'Leitura organizada', description: 'Registros concentrados para reduzir digitação e conferências dispersas.' },
          { title: 'Cálculo e faturamento', description: 'Continuidade entre o consumo apurado e a emissão das faturas.' },
          { title: 'Acompanhamento financeiro', description: 'Mais visibilidade sobre cobranças e pagamentos.' },
        ]),
        closing(),
      ].join(''),
      callToAction: { label: 'Ver como o SGA funciona', href: SGA_URL },
      includeUnsubscribe: true,
    }),
    text: `Olá, {{nome}}.

Conferir leituras em uma planilha, calcular em outra ferramenta e depois transportar os dados para faturamento cria pontos de falha e consome horas da equipe.

A proposta do SGA é transformar essas etapas em um fluxo contínuo, com as informações disponíveis no mesmo ambiente:

- Leitura organizada.
- Cálculo e faturamento integrados.
- Acompanhamento financeiro.

Veja como funciona: ${SGA_URL}

Se fizer sentido para sua operação, basta responder este e-mail.

Cancelar inscrição: %unsubscribe_url%`,
  },
  {
    name: 'SGA · 03 Transparência ao consumidor',
    subject: '{{nome}}, seus consumidores entendem com facilidade o que estão pagando?',
    html: renderBzsEmailLayout({
      preheader: 'Informações de consumo claras ajudam a tornar o atendimento mais transparente.',
      title: 'Uma fatura clara também melhora a experiência do cliente.',
      bodyHtml: [
        paragraph('Olá, <strong style="color:#182a33">{{nome}}</strong>.'),
        paragraph('Dúvidas sobre leitura, consumo e valor cobrado costumam gerar retrabalho no atendimento. Quando as informações chegam organizadas, a conversa com o consumidor fica mais objetiva.'),
        paragraph('Com o SGA, a fatura pode apresentar leitura anterior e atual, consumo do período, valor e histórico dos últimos meses — informações úteis para conferência e acompanhamento.'),
        highlight('Mais transparência para o consumidor e uma base de consulta mais consistente para sua equipe de atendimento.'),
        closing(),
      ].join(''),
      callToAction: { label: 'Conhecer os recursos do SGA', href: SGA_URL },
      includeUnsubscribe: true,
    }),
    text: `Olá, {{nome}}.

Dúvidas sobre leitura, consumo e valor cobrado costumam gerar retrabalho no atendimento. Quando as informações chegam organizadas, a conversa com o consumidor fica mais objetiva.

Com o SGA, a fatura pode apresentar leitura anterior e atual, consumo do período, valor e histórico dos últimos meses — informações úteis para conferência e acompanhamento.

Conheça os recursos: ${SGA_URL}

Se fizer sentido para sua operação, basta responder este e-mail.

Cancelar inscrição: %unsubscribe_url%`,
  },
  {
    name: 'SGA · 04 Convite para demonstração',
    subject: 'Podemos mapear sua operação de água e gás em 20 minutos?',
    html: renderBzsEmailLayout({
      preheader: 'Uma conversa objetiva para entender seu fluxo atual e apresentar o SGA.',
      title: 'Que tal ver o SGA aplicado à sua rotina?',
      bodyHtml: [
        paragraph('Olá, <strong style="color:#182a33">{{nome}}</strong>.'),
        paragraph('Cada operação possui regras, etapas e necessidades próprias. Por isso, antes de apresentar telas, nossa equipe procura entender como as leituras chegam, como os cálculos são feitos e onde acontecem as principais conferências.'),
        highlight('<strong style="color:#182a33">Em uma conversa de 20 minutos</strong>, podemos mapear o fluxo atual e mostrar os pontos do SGA que fazem sentido para sua realidade.'),
        paragraph('Sem compromisso e sem apresentação genérica: o objetivo é avaliar se existe aderência entre a solução e sua operação.'),
        closing(),
      ].join(''),
      callToAction: { label: 'Solicitar uma demonstração', href: SGA_URL },
      includeUnsubscribe: true,
    }),
    text: `Olá, {{nome}}.

Cada operação possui regras, etapas e necessidades próprias. Por isso, antes de apresentar telas, nossa equipe procura entender como as leituras chegam, como os cálculos são feitos e onde acontecem as principais conferências.

Em uma conversa de 20 minutos, podemos mapear o fluxo atual e mostrar os pontos do SGA que fazem sentido para sua realidade.

Solicite uma demonstração: ${SGA_URL}

Se fizer sentido, basta responder este e-mail.

Cancelar inscrição: %unsubscribe_url%`,
  },
  {
    name: 'SGA · 05 Último contato',
    subject: 'Encerrando meu contato sobre o SGA',
    html: renderBzsEmailLayout({
      preheader: 'Este é meu último contato sobre a gestão de água e gás.',
      title: 'Deixo a porta aberta para quando fizer sentido.',
      bodyHtml: [
        paragraph('Olá, <strong style="color:#182a33">{{nome}}</strong>.'),
        paragraph('Como não consegui falar com você, este será meu último contato por agora. Não quero ocupar sua caixa de entrada se a modernização da gestão de água e gás não estiver entre as prioridades deste momento.'),
        paragraph('Se o tema voltar à pauta, o SGA pode apoiar sua equipe na organização de leituras, cálculos, faturamento, cobranças e acompanhamento financeiro.'),
        highlight('Se quiser conversar agora ou no futuro, responda este e-mail com <strong style="color:#182a33">“quero conhecer”</strong> e retomamos a partir daí.'),
        paragraph('Obrigado pelo seu tempo.'),
      ].join(''),
      callToAction: { label: 'Guardar informações do SGA', href: SGA_URL },
      includeUnsubscribe: true,
    }),
    text: `Olá, {{nome}}.

Como não consegui falar com você, este será meu último contato por agora. Não quero ocupar sua caixa de entrada se a modernização da gestão de água e gás não estiver entre as prioridades deste momento.

Se o tema voltar à pauta, o SGA pode apoiar sua equipe na organização de leituras, cálculos, faturamento, cobranças e acompanhamento financeiro.

Se quiser conversar agora ou no futuro, responda este e-mail com “quero conhecer”.

Mais informações: ${SGA_URL}

Obrigado pelo seu tempo.

Cancelar inscrição: %unsubscribe_url%`,
  },
] as const;

import type { PrismaClient } from '@prisma/client';
import { escapeEmailHtml as escapeHtml, renderBzsEmailLayout } from '@prospecta/contracts';
import { MailgunClient } from './mailgun-client.js';

const TIMEZONE = 'America/Sao_Paulo';
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIMEZONE,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
});

type DigestTask = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  dueAt: Date;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assigneeId: string | null;
  assignee: { id: string; name: string; email: string } | null;
  organization: { name: string };
  company: { name: string } | null;
  contact: { name: string } | null;
  opportunity: { title: string } | null;
};

export class TaskDigestProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly mailgun = new MailgunClient(),
  ) {}

  async process(reference = new Date()) {
    const digestDateKey = dayFormatter.format(reference);
    const { start, end } = saoPauloDayRange(digestDateKey);
    const tasks = await this.db.task.findMany({
      where: {
        status: 'OPEN',
        dueAt: { gte: start, lt: end },
        assigneeId: { not: null },
        assignee: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        organizationId: true,
        title: true,
        description: true,
        dueAt: true,
        priority: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true, email: true } },
        organization: { select: { name: true } },
        company: { select: { name: true } },
        contact: { select: { name: true } },
        opportunity: { select: { title: true } },
      },
      orderBy: [{ assigneeId: 'asc' }, { dueAt: 'asc' }],
    }) as DigestTask[];

    const byAssignee = new Map<string, DigestTask[]>();
    for (const task of tasks) {
      if (!task.assigneeId || !task.assignee?.email) continue;
      const current = byAssignee.get(task.assigneeId) || [];
      current.push(task);
      byAssignee.set(task.assigneeId, current);
    }

    const digestDate = new Date(`${digestDateKey}T00:00:00.000Z`);
    const failures: string[] = [];
    let sent = 0;
    let skipped = 0;
    for (const [userId, userTasks] of byAssignee) {
      const existing = await this.db.taskDigestDelivery.findUnique({
        where: { userId_digestDate: { userId, digestDate } },
        select: { id: true, status: true },
      });
      if (existing?.status === 'SENT') {
        skipped += 1;
        continue;
      }

      const first = userTasks[0];
      const delivery = existing
        ? await this.db.taskDigestDelivery.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            taskCount: userTasks.length,
            attempts: { increment: 1 },
            lastError: null,
          },
        })
        : await this.db.taskDigestDelivery.create({
          data: {
            organizationId: first.organizationId,
            userId,
            digestDate,
            taskCount: userTasks.length,
            attempts: 1,
          },
        });

      const content = renderTaskDigest(first.assignee!, userTasks, digestDateKey);
      try {
        const result = await this.mailgun.sendTaskDigest({
          to: first.assignee!.email,
          subject: content.subject,
          html: content.html,
          text: content.text,
          userId,
          digestDate: digestDateKey,
        });
        await this.db.taskDigestDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SENT',
            providerMessageId: result.id,
            sentAt: new Date(),
            lastError: null,
          },
        });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida no envio do resumo';
        await this.db.taskDigestDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', lastError: message.slice(0, 1000) },
        });
        failures.push(`${first.assignee!.email}: ${message}`);
      }
    }

    if (failures.length) {
      throw new Error(`Falha em ${failures.length} resumo(s) de tarefas: ${failures.join(' | ')}`.slice(0, 2000));
    }
    return { date: digestDateKey, users: byAssignee.size, sent, skipped, tasks: tasks.length };
  }

}

export function saoPauloDayRange(dateKey: string) {
  const start = new Date(`${dateKey}T03:00:00.000Z`);
  const nextDay = new Date(`${dateKey}T12:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextKey = nextDay.toISOString().slice(0, 10);
  return { start, end: new Date(`${nextKey}T03:00:00.000Z`) };
}

export function renderTaskDigest(
  assignee: { name: string; email: string },
  tasks: DigestTask[],
  dateKey: string,
) {
  const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const friendlyDate = capitalize(dateFormatter.format(new Date(`${dateKey}T12:00:00.000Z`)));
  const subject = `Suas tarefas de hoje · ${friendlyDate}`;
  const rows = tasks.map((task) => {
    const related = task.company?.name || task.contact?.name || task.opportunity?.title || '';
    const description = task.description?.trim() || '';
    return {
      time: timeFormatter.format(task.dueAt),
      title: task.title,
      related,
      description,
      priority: priorityLabel(task.priority),
    };
  });
  const text = [
    `Olá, ${assignee.name}.`,
    '',
    `Estas são suas ${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} para ${friendlyDate}:`,
    '',
    ...rows.flatMap((row) => [
      `${row.time} · ${row.title} · Prioridade ${row.priority}${row.related ? ` · ${row.related}` : ''}`,
      ...(row.description ? [`  ${row.description}`] : []),
    ]),
    '',
    `Abrir agenda: ${appUrl}/tarefas`,
  ].join('\n');
  const htmlRows = rows.map((row) => `
    <tr>
      <td style="padding:14px 10px;border-top:1px solid #e7ebef;white-space:nowrap;font-weight:700;color:#168cbe">${escapeHtml(row.time)}</td>
      <td style="padding:14px 10px;border-top:1px solid #e7ebef">
        <strong style="display:block;color:#20262c">${escapeHtml(row.title)}</strong>
        ${row.related ? `<span style="display:block;margin-top:4px;color:#66727d">${escapeHtml(row.related)}</span>` : ''}
        ${row.description ? `<span style="display:block;margin-top:5px;color:#66727d">${escapeHtml(row.description)}</span>` : ''}
      </td>
      <td style="padding:14px 10px;border-top:1px solid #e7ebef;white-space:nowrap;color:#66727d">${escapeHtml(row.priority)}</td>
    </tr>`).join('');
  const html = renderBzsEmailLayout({
    preheader: `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} programada${tasks.length === 1 ? '' : 's'} para ${friendlyDate}.`,
    eyebrow: 'RESUMO DIÁRIO',
    brandLabel: 'BZS ONE',
    title: 'Tarefas de hoje',
    bodyHtml: `
      <p style="margin:0 0 7px;font-size:14px;line-height:21px;font-weight:700;color:#168cbe">${escapeHtml(friendlyDate)}</p>
      <p style="margin:0 0 22px">Olá, <strong style="color:#182a33">${escapeHtml(assignee.name)}</strong>. Você tem ${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} programada${tasks.length === 1 ? '' : 's'} para hoje.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr>
            <th style="padding:9px 10px;text-align:left;color:#66727d">Horário</th>
            <th style="padding:9px 10px;text-align:left;color:#66727d">Tarefa</th>
            <th style="padding:9px 10px;text-align:left;color:#66727d">Prioridade</th>
          </tr>
        </thead>
        <tbody>${htmlRows}</tbody>
      </table>`,
    callToAction: { label: 'Abrir minha agenda', href: `${appUrl}/tarefas` },
    footerText: 'Este resumo automático foi enviado pelo BZS One para ajudar você a organizar o dia.',
  });
  return { subject, html, text };
}

function priorityLabel(priority: DigestTask['priority']) {
  if (priority === 'HIGH') return 'Alta';
  if (priority === 'LOW') return 'Baixa';
  return 'Média';
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

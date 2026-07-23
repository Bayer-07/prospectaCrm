import { Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { QUEUE_CONNECTION } from '../queue/queue.module.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@WebSocketGateway({ cors: { origin: (process.env.APP_URL || 'http://localhost:5173').split(','), credentials: true }, namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private subscriber?: Redis;

  constructor(private readonly db: PrismaService, @Inject(QUEUE_CONNECTION) private readonly redis: Redis) {}

  async onModuleInit() {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe('prospecta:realtime');
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const message = JSON.parse(raw) as { organizationId: string; event: string; payload?: unknown; userId?: string };
        this.notifyOrganization(message.organizationId, message.event, message.payload || {});
        if (message.userId) this.notifyUser(message.userId, message.event, message.payload || {});
      } catch { /* evento inválido é ignorado sem afetar a conexão */ }
    });
  }

  async onModuleDestroy() { await this.subscriber?.quit(); }

  async handleConnection(socket: Socket) {
    const cookie = socket.handshake.headers.cookie || '';
    const token = cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith('prospecta_session='))?.split('=').slice(1).join('=');
    if (!token) return socket.disconnect(true);
    const session = await this.db.session.findUnique({ where: { tokenHash: hash(decodeURIComponent(token)) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') return socket.disconnect(true);
    await socket.join([`organization:${session.user.organizationId}`, `user:${session.userId}`]);
  }

  notifyOrganization(organizationId: string, event: string, payload: unknown) {
    this.server?.to(`organization:${organizationId}`).emit(event, payload);
  }

  notifyUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}

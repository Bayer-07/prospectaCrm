import { Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { SESSION_COOKIE } from '../auth/auth-cookies.js';
import { SessionTokenService } from '../auth/session-token.service.js';
import { configuredCorsOrigins } from '../config/cors-origins.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QUEUE_CONNECTION } from '../queue/queue.module.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@WebSocketGateway({ cors: { origin: configuredCorsOrigins(), credentials: true }, namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private subscriber?: Redis;

  constructor(
    private readonly db: PrismaService,
    private readonly sessionTokens: SessionTokenService,
    @Inject(QUEUE_CONNECTION) private readonly redis: Redis,
  ) {}

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
    const token = cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${SESSION_COOKIE}=`))?.split('=').slice(1).join('=');
    if (!token) return socket.disconnect(true);
    const decodedToken = decodeURIComponent(token);
    const claims = await this.sessionTokens.verify(decodedToken);
    if (!claims) return socket.disconnect(true);
    const session = await this.db.session.findUnique({ where: { tokenHash: hash(decodedToken) }, include: { user: true } });
    if (
      !session
      || session.id !== claims.sessionId
      || session.userId !== claims.userId
      || session.expiresAt <= new Date()
      || session.user.status !== 'ACTIVE'
    ) return socket.disconnect(true);
    await socket.join([`organization:${session.user.organizationId}`, `user:${session.userId}`]);
  }

  notifyOrganization(organizationId: string, event: string, payload: unknown) {
    this.server?.to(`organization:${organizationId}`).emit(event, payload);
  }

  notifyUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  disconnectUser(userId: string) {
    this.server?.in(`user:${userId}`).disconnectSockets(true);
  }
}

import { BadRequestException, CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { from, mergeMap, Observable, of, tap } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from '../auth/types.js';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly db: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const sensitive = request.method === 'POST' && /^\/api\/v1\/(companies|contacts|opportunities|tasks|activities|imports)/.test(request.originalUrl);
    if (!sensitive || request.auth?.type !== 'apiKey') return next.handle();
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8 || key.length > 160) throw new BadRequestException('Idempotency-Key obrigatório');
    const route = request.originalUrl.split('?')[0];
    const requestHash = createHash('sha256').update(JSON.stringify(request.body || {})).digest('hex');
    return from(this.db.idempotencyRecord.findUnique({ where: { organizationId_key_route: { organizationId: request.auth.organizationId, key, route } } })).pipe(
      mergeMap((record) => {
        if (record) {
          if (record.requestHash !== requestHash) throw new ConflictException('Idempotency-Key já utilizado com outro conteúdo');
          response.statusCode = record.responseCode;
          return of(record.responseBody);
        }
        return next.handle().pipe(tap((body) => {
          void this.db.idempotencyRecord.create({ data: {
            organizationId: request.auth.organizationId, key, route, requestHash,
            responseCode: response.statusCode, responseBody: body as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 3_600_000),
          } }).catch(() => undefined);
        }));
      }),
    );
  }
}

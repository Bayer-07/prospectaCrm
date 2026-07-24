import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { filterPublicApiDocument } from './swagger/public-api-document.js';
import { SWAGGER_DARK_THEME } from './swagger/swagger-dark-theme.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression({ threshold: 1_024 }));
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.APP_URL || 'http://localhost:5173').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key'],
  });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'webhooks/evolution', 'webhooks/mailgun'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('BZS One · API de Integração')
    .setDescription('Endpoints destinados a integrações externas. Gere uma chave em Configurações → API e webhooks e informe-a no botão Authorize.')
    .setVersion('1.0')
    .addServer('/', 'Servidor atual')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'API Key',
      description: 'Informe a chave gerada em Configurações → API e webhooks.',
    }, 'api-key')
    .addSecurityRequirements('api-key')
    .build();
  const publicApiDocument = filterPublicApiDocument(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('docs', app, publicApiDocument, {
    customCss: SWAGGER_DARK_THEME,
    customSiteTitle: 'Swagger · BZS One',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      operationsSorter: 'alpha',
      persistAuthorization: true,
      tagsSorter: 'alpha',
    },
  });

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '::');
  await app.listen(port, host);
  console.log(`BZS One API disponível em http://localhost:${port}`);
}

void bootstrap();

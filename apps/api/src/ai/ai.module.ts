import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { MediaModule } from '../media/media.module.js';

@Module({ imports: [MediaModule], controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}

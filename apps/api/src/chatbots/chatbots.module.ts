import { Module } from '@nestjs/common';
import { ChatbotsController } from './chatbots.controller.js';
import { ChatbotsService } from './chatbots.service.js';

@Module({ controllers: [ChatbotsController], providers: [ChatbotsService] })
export class ChatbotsModule {}

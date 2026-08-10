import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { QuickRepliesController } from './quick-replies.controller.js';
import { QuickRepliesService } from './quick-replies.service.js';

@Module({
  imports: [MediaModule],
  controllers: [QuickRepliesController],
  providers: [QuickRepliesService],
})
export class QuickRepliesModule {}

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthContext } from '../auth/types.js';
import { MediaService } from './media.service.js';

@ApiTags('Mídias')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  async upload(@CurrentUser() auth: AuthContext, @Body() body: { filename: string; contentType: string; sizeBytes: number }) {
    return { data: await this.media.createUpload(auth, body) };
  }

  @Get(':id/url')
  async url(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Query('download') download?: string) {
    return { data: await this.media.downloadUrl(auth, id, download === 'true') };
  }
}

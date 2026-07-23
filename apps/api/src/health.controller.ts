import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator.js';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'prospecta-api', timestamp: new Date().toISOString() };
  }
}

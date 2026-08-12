import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { resolvePublicHttpUrl, type PublicAddressResolver } from '@prospecta/contracts/public-http-url';

@Injectable()
export class OutboundWebhookUrlService {
  constructor(@Optional() private readonly resolveAddresses?: PublicAddressResolver) {}

  async validate(endpoint: string) {
    try {
      const result = await resolvePublicHttpUrl(endpoint, this.resolveAddresses);
      return result.url.toString();
    } catch {
      throw new BadRequestException('Informe um endpoint HTTP ou HTTPS público, sem credenciais na URL');
    }
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalDeliveryEndpoint = process.env.S3_DELIVERY_ENDPOINT;
const originalS3Secret = process.env.S3_SECRET_KEY;

afterEach(() => {
  if (originalDeliveryEndpoint === undefined) delete process.env.S3_DELIVERY_ENDPOINT;
  else process.env.S3_DELIVERY_ENDPOINT = originalDeliveryEndpoint;
  if (originalS3Secret === undefined) delete process.env.S3_SECRET_KEY;
  else process.env.S3_SECRET_KEY = originalS3Secret;
  vi.resetModules();
});

describe('URL de entrega de mídias', () => {
  it('assina a URL com o hostname alcançável pela Evolution', async () => {
    process.env.S3_DELIVERY_ENDPOINT = 'http://host.docker.internal:9000';
    process.env.S3_SECRET_KEY = 'test-only-s3-secret';
    vi.resetModules();
    const { signedMediaUrl } = await import('./storage.js');

    const signed = new URL(await signedMediaUrl('organization/file.png'));

    expect(signed.origin).toBe('http://host.docker.internal:9000');
    expect(signed.pathname).toBe('/prospecta-media/organization/file.png');
    expect(signed.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });
});

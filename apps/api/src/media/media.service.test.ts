import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { MediaService } from './media.service.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('http://storage.local/upload'),
}));

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel',
  permissions: [],
};

describe('MediaService uploads', () => {
  const create = vi.fn();
  const service = new MediaService({ mediaAsset: { create } } as never);

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: 'media-1' });
  });

  it('aceita áudio WebM/Opus e remove parâmetros do MIME antes de assinar', async () => {
    const result = await service.createUpload(auth, {
      filename: 'audio.webm',
      contentType: 'audio/webm;codecs=opus',
      sizeBytes: 2048,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contentType: 'audio/webm', filename: 'audio.webm', sizeBytes: 2048 }),
    });
    expect(result.uploadUrl).toBe('http://storage.local/upload');
  });
});

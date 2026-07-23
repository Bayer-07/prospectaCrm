import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { MediaController } from './media.controller.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel',
  permissions: [],
};

describe('MediaController', () => {
  it('solicita uma URL com disposição de anexo apenas para downloads', async () => {
    const downloadUrl = vi.fn().mockResolvedValue({ url: 'http://storage/audio.ogg' });
    const controller = new MediaController({ downloadUrl } as never);

    await controller.url(auth, 'media-1', 'true');
    await controller.url(auth, 'media-2');

    expect(downloadUrl).toHaveBeenNthCalledWith(1, auth, 'media-1', true);
    expect(downloadUrl).toHaveBeenNthCalledWith(2, auth, 'media-2', false);
  });
});

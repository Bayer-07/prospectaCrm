import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { TranscriptionsService } from './transcriptions.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel',
  permissions: [],
};

describe('TranscriptionsService', () => {
  it('queues a single transcription and exposes the processing state', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const add = vi.fn().mockResolvedValue({ id: 'job-1' });
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1' }) },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'message-1',
          conversationId: 'conversation-1',
          type: 'audio',
          payload: {},
          transcriptionStatus: null,
          transcriptionText: null,
          transcriptionError: null,
          transcriptionProvider: null,
          transcribedAt: null,
          updatedAt: new Date(),
          media: [{ id: 'media-1', contentType: 'audio/ogg' }],
        }),
        updateMany,
      },
    };
    const service = new TranscriptionsService(db as never, { add } as never);

    const result = await service.request(auth, 'conversation-1', 'message-1');

    expect(result.status).toBe('PROCESSING');
    expect(updateMany).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(
      'transcribe-audio',
      { messageId: 'message-1' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('reuses a completed transcription without queueing again', async () => {
    const add = vi.fn();
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1' }) },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'message-1',
          conversationId: 'conversation-1',
          type: 'audio',
          payload: {},
          transcriptionStatus: 'COMPLETED',
          transcriptionText: 'Texto já salvo',
          transcriptionError: null,
          transcriptionProvider: 'speech.example.test',
          transcribedAt: new Date(),
          updatedAt: new Date(),
          media: [{ id: 'media-1', contentType: 'audio/ogg' }],
        }),
      },
    };
    const service = new TranscriptionsService(db as never, { add } as never);

    const result = await service.request(auth, 'conversation-1', 'message-1');

    expect(result.text).toBe('Texto já salvo');
    expect(add).not.toHaveBeenCalled();
  });
});

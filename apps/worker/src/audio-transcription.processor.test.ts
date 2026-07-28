import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storedMediaBuffer } from './storage.js';
import { AudioTranscriptionProcessor } from './audio-transcription.processor.js';

vi.mock('./storage.js', () => ({
  storedMediaBuffer: vi.fn(),
}));

describe('AudioTranscriptionProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['INBOUND', 'OUTBOUND'])('persists the text of an %s audio and refreshes the conversation', async (direction) => {
    vi.mocked(storedMediaBuffer).mockResolvedValue(Buffer.from('audio'));
    const update = vi.fn().mockResolvedValue({});
    const db = {
      message: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'message-1',
          conversationId: 'conversation-1',
          direction,
          type: 'audio',
          transcriptionStatus: 'PROCESSING',
          transcriptionText: null,
          conversation: { organizationId: 'organization-1' },
          media: [{ key: 'audio/key.ogg', filename: 'audio.ogg', contentType: 'audio/ogg' }],
        }),
        update,
      },
    };
    const client = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'Esta é a mensagem transcrita.',
        provider: 'speech.example.test · whisper-test',
      }),
    };
    const processor = new AudioTranscriptionProcessor(db as never, client as never);

    const event = await processor.process({
      data: { messageId: 'message-1' },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as Job<{ messageId: string }>);

    expect(storedMediaBuffer).toHaveBeenCalledWith('audio/key.ogg', 25 * 1024 * 1024);
    expect(client.transcribe).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'audio.ogg',
      contentType: 'audio/ogg',
    }));
    expect(update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: expect.objectContaining({
        transcriptionStatus: 'COMPLETED',
        transcriptionText: 'Esta é a mensagem transcrita.',
        transcriptionError: null,
      }),
    });
    expect(event).toEqual({
      organizationId: 'organization-1',
      event: 'inbox.updated',
      payload: {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        transcriptionStatus: 'COMPLETED',
      },
    });
  });
});

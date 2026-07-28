import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionClient, TranscriptionConfigurationError } from './transcription-client.js';

describe('TranscriptionClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends the audio as multipart and returns the transcription', async () => {
    vi.stubEnv('TRANSCRIPTION_API_URL', 'https://speech.example.test/v1/audio/transcriptions');
    vi.stubEnv('TRANSCRIPTION_API_KEY', 'test-key');
    vi.stubEnv('TRANSCRIPTION_MODEL', 'whisper-test');
    vi.stubEnv('TRANSCRIPTION_LANGUAGE', 'pt');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'Olá, tudo bem?' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await new TranscriptionClient().transcribe({
      body: Buffer.from('audio'),
      filename: 'mensagem.ogg',
      contentType: 'audio/ogg',
    });

    expect(result.text).toBe('Olá, tudo bem?');
    expect(result.provider).toContain('speech.example.test');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://speech.example.test/v1/audio/transcriptions');
    expect(init?.headers).toEqual({ Authorization: 'Bearer test-key' });
    const form = init?.body as FormData;
    expect(form.get('model')).toBe('whisper-test');
    expect(form.get('language')).toBe('pt');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('explains when the default provider has no API key', async () => {
    vi.stubEnv('TRANSCRIPTION_API_URL', 'https://api.openai.com/v1/audio/transcriptions');
    vi.stubEnv('TRANSCRIPTION_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');

    await expect(new TranscriptionClient().transcribe({
      body: Buffer.from('audio'),
      filename: 'mensagem.ogg',
      contentType: 'audio/ogg',
    })).rejects.toBeInstanceOf(TranscriptionConfigurationError);
  });

  it('downloads a missing local Speaches model and retries the transcription', async () => {
    vi.stubEnv('TRANSCRIPTION_API_URL', 'http://localhost:8000/v1/audio/transcriptions');
    vi.stubEnv('TRANSCRIPTION_API_KEY', '');
    vi.stubEnv('TRANSCRIPTION_MODEL', 'Systran/faster-whisper-small');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        detail: "Model 'Systran/faster-whisper-small' is not installed locally.",
      }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'Modelo local funcionando.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    const result = await new TranscriptionClient().transcribe({
      body: Buffer.from('audio'),
      filename: 'mensagem.ogg',
      contentType: 'audio/ogg',
    });

    expect(result.text).toBe('Modelo local funcionando.');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'http://localhost:8000/v1/models/Systran%2Ffaster-whisper-small',
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
  });
});

import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EvolutionClient } from './evolution-client.js';

let server: ReturnType<typeof createServer>;
let requests: Array<{ url: string; apiKey?: string; body: Record<string, unknown> }> = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/audio-gravado.webm') {
      response.setHeader('content-type', 'audio/webm');
      response.end(Buffer.from('webm-audio'));
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ url: request.url || '', apiKey: request.headers.apikey as string, body: JSON.parse(body) });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(
        request.url?.includes('getBase64FromMediaMessage')
          ? { mediaType: 'stickerMessage', mimetype: 'image/webp', fileName: 'figurinha.webp', base64: 'UklGRg==' }
          : request.url?.includes('findMessages')
            ? { messages: { total: 1, records: [{ key: { id: 'document-caption-1' }, message: { documentMessage: { caption: 'Legenda recuperada' } } }] } }
            : { key: { id: `simulated-${requests.length}` } },
      ));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Simulador não iniciou');
  process.env.EVOLUTION_API_URL = `http://127.0.0.1:${address.port}`;
  process.env.EVOLUTION_API_KEY = 'test-key';
});

afterAll(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

describe('contrato de envio Evolution', () => {
  it('envia texto no endpoint e formato esperados', async () => {
    const result = await new EvolutionClient().send('comercial', { number: '+5511999999999', type: 'text', text: 'Olá' });
    expect(result.key.id).toBe('simulated-1');
    expect(requests[0]).toMatchObject({ url: '/message/sendText/comercial', apiKey: 'test-key', body: { number: '5511999999999', text: 'Olá' } });
  });

  it('envia mídia usando URL temporária', async () => {
    await new EvolutionClient().send('comercial', { number: '+5511999999999', type: 'image', text: 'Legenda', mediaUrl: 'http://minio.local/arquivo-assinado' });
    expect(requests[1]).toMatchObject({ url: '/message/sendMedia/comercial', body: { number: '5511999999999', mediatype: 'image', media: 'http://minio.local/arquivo-assinado', caption: 'Legenda' } });
  });

  it('preserva o endereço LID aprendido nos eventos do WhatsApp', async () => {
    await new EvolutionClient().send('comercial', { number: '83953759293475@lid', type: 'text', text: 'Teste' });
    expect(requests[2]).toMatchObject({ url: '/message/sendText/comercial', body: { number: '83953759293475@lid', text: 'Teste' } });
  });

  it('envia a mensagem citada ao responder', async () => {
    await new EvolutionClient().send('comercial', {
      number: '+5511999999999',
      type: 'text',
      text: 'Minha resposta',
      quoted: {
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'original-1' },
        message: { conversation: 'Mensagem original' },
      },
    });
    expect(requests[3]).toMatchObject({
      url: '/message/sendText/comercial',
      body: {
        number: '5511999999999',
        text: 'Minha resposta',
        quoted: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'original-1' },
          message: { conversation: 'Mensagem original' },
        },
      },
    });
  });

  it('baixa a figurinha pelo endpoint de mídia da Evolution', async () => {
    const result = await new EvolutionClient().getMedia('comercial', { key: { id: 'sticker-1' }, messageType: 'stickerMessage', message: { stickerMessage: {} } });

    expect(result).toMatchObject({ mimetype: 'image/webp', fileName: 'figurinha.webp', base64: 'UklGRg==' });
    expect(requests[4]).toMatchObject({
      url: '/chat/getBase64FromMediaMessage/comercial',
      apiKey: 'test-key',
      body: { message: { key: { id: 'sticker-1' }, messageType: 'stickerMessage', message: { stickerMessage: {} } } },
    });
  });

  it('consulta mensagens armazenadas para recuperar legendas omitidas do webhook', async () => {
    const result = await new EvolutionClient().findMessages('comercial', '83953759293475@lid');

    expect(result).toEqual([{ key: { id: 'document-caption-1' }, message: { documentMessage: { caption: 'Legenda recuperada' } } }]);
    expect(requests[5]).toMatchObject({
      url: '/chat/findMessages/comercial',
      apiKey: 'test-key',
      body: { where: { key: { remoteJid: '83953759293475@lid' } }, page: 1, offset: 50 },
    });
  });

  it('consulta as mensagens recentes da instância sem depender de um contato', async () => {
    await new EvolutionClient().findMessages('comercial');

    expect(requests[6]).toMatchObject({
      url: '/chat/findMessages/comercial',
      apiKey: 'test-key',
      body: { where: {}, page: 1, offset: 50 },
    });
  });

  it('envia áudio como mensagem de voz pelo endpoint dedicado', async () => {
    await new EvolutionClient().send('comercial', {
      number: '+5511999999999',
      type: 'audio',
      mediaUrl: `${process.env.EVOLUTION_API_URL}/audio-gravado.webm`,
      quoted: {
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'audio-original-1' },
        message: { conversation: 'Mensagem original' },
      },
    });

    expect(requests[7]).toMatchObject({
      url: '/message/sendWhatsAppAudio/comercial',
      body: {
        number: '5511999999999',
        audio: Buffer.from('webm-audio').toString('base64'),
        delay: 0,
        quoted: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'audio-original-1' },
          message: { conversation: 'Mensagem original' },
        },
      },
    });
  });

  it('envia o áudio já lido do armazenamento sem depender de uma URL de rede', async () => {
    const audio = Buffer.from('audio-direto-do-minio').toString('base64');

    await new EvolutionClient().send('comercial', {
      number: '+5511999999999',
      type: 'audio',
      mediaBase64: audio,
    });

    expect(requests[8]).toMatchObject({
      url: '/message/sendWhatsAppAudio/comercial',
      body: {
        number: '5511999999999',
        audio,
        delay: 0,
      },
    });
  });
});

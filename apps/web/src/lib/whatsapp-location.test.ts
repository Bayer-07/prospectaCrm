import { describe, expect, it } from 'vitest';
import { extractWhatsappLocation } from './whatsapp-location';

describe('localização compartilhada pelo WhatsApp', () => {
  it('extrai coordenadas e a miniatura numérica enviada pela Evolution', () => {
    const location = extractWhatsappLocation({
      message: {
        locationMessage: {
          degreesLatitude: -24.5588903,
          degreesLongitude: -54.0577961,
          jpegThumbnail: { 0: 255, 1: 216, 2: 255 },
        },
      },
    });

    expect(location).toMatchObject({
      latitude: -24.5588903,
      longitude: -54.0577961,
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=-24.5588903%2C-54.0577961',
    });
    expect(location?.thumbnailUrl).toBe('data:image/jpeg;base64,/9j/');
  });

  it('aceita localização ao vivo e seus dados descritivos', () => {
    expect(extractWhatsappLocation({
      message: {
        liveLocationMessage: {
          degreesLatitude: '-25.5',
          degreesLongitude: '-54.5',
          caption: 'Equipe externa',
          address: 'Cascavel, PR',
        },
      },
    })).toMatchObject({
      latitude: -25.5,
      longitude: -54.5,
      name: 'Equipe externa',
      address: 'Cascavel, PR',
    });
  });

  it('ignora payloads sem coordenadas válidas', () => {
    expect(extractWhatsappLocation({ message: { locationMessage: { degreesLatitude: 200 } } })).toBeNull();
    expect(extractWhatsappLocation({ message: { conversation: 'Olá' } })).toBeNull();
  });
});

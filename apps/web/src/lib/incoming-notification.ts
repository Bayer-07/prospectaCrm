export type InboxRealtimePayload = {
  conversationId?: string;
  newMessage?: {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    assigneeId: string | null;
  };
};

type NotificationUser = {
  userId?: string;
  roleKey?: string;
};

export function openInboxConversationId(pathname: string) {
  const match = /^\/inbox\/([^/?#]+)/.exec(pathname);
  if (!match?.[1]) return undefined;
  try { return decodeURIComponent(match[1]); }
  catch { return match[1]; }
}

export function shouldPlayIncomingMessageSound(payload: InboxRealtimePayload | undefined, pathname: string, user: NotificationUser | null, pageFocused = true) {
  if (!payload?.conversationId || payload.newMessage?.direction !== 'INBOUND') return false;
  if (pageFocused && openInboxConversationId(pathname) === payload.conversationId) return false;
  if (payload.newMessage.assigneeId && user?.roleKey !== 'admin' && payload.newMessage.assigneeId !== user?.userId) return false;
  return true;
}

export function createNotificationAudioContext() {
  const AudioContextConstructor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

export async function playIncomingMessageSound(context: AudioContext) {
  if (context.state === 'suspended') await context.resume();
  if (context.state !== 'running') return;

  const startAt = context.currentTime + 0.01;
  const master = context.createGain();
  master.gain.setValueAtTime(0.17, startAt);
  master.connect(context.destination);

  const notes = [
    { frequency: 1046.5, delay: 0, duration: 0.18 },
    { frequency: 1318.5, delay: 0.11, duration: 0.18 },
    { frequency: 1568, delay: 0.22, duration: 0.24 },
  ];

  for (const note of notes) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const noteStart = startAt + note.delay;
    const noteEnd = noteStart + note.duration;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    envelope.gain.setValueAtTime(0.0001, noteStart);
    envelope.gain.exponentialRampToValueAtTime(0.72, noteStart + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.01);
  }

  master.gain.setValueAtTime(0.17, startAt + 0.42);
  master.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.52);
}

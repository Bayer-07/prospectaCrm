export function aiSuggestionDisposition(input: Readonly<{
  composerText: string;
  hasAttachment: boolean;
  requestedRevision: number;
  currentRevision: number;
}>) {
  return !input.composerText.trim() && !input.hasAttachment && input.requestedRevision === input.currentRevision
    ? 'insert'
    : 'offer';
}

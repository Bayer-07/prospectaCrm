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

export function aiMessageImprovementDisposition(input: Readonly<{
  composerText: string;
  requestedText: string;
  requestedRevision: number;
  currentRevision: number;
}>) {
  return input.composerText === input.requestedText && input.requestedRevision === input.currentRevision
    ? 'replace'
    : 'offer';
}

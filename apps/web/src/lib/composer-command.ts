export type ComposerCommand = 'quick-reply' | 'automation' | null;

export function detectComposerCommand(value: string, options: {
  canReply: boolean;
  editing: boolean;
  hasFile: boolean;
}): ComposerCommand {
  if (!options.canReply || options.editing || value.includes('\n')) return null;
  if (value.startsWith('/')) return 'quick-reply';
  if (!options.hasFile && value.startsWith('@')) return 'automation';
  return null;
}

export function composerCommandSearch(value: string, prefix: '/' | '@') {
  return value.startsWith(prefix) ? value.slice(1).trim().toLocaleLowerCase('pt-BR') : '';
}

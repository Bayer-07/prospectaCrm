import EmojiPicker, { EmojiStyle, SuggestionMode, Theme } from 'emoji-picker-react';
import portugueseEmojiData from 'emoji-picker-react/dist/data/emojis-pt';

export default function EmojiPickerPopover({ onEmojiSelect }: { onEmojiSelect(emoji: string): void }) {
  const theme = document.documentElement.dataset.theme === 'dark' ? Theme.DARK : Theme.LIGHT;

  return <EmojiPicker
    emojiData={portugueseEmojiData}
    emojiStyle={EmojiStyle.NATIVE}
    theme={theme}
    suggestedEmojisMode={SuggestionMode.RECENT}
    lazyLoadEmojis
    autoFocusSearch
    searchPlaceholder="Buscar emoji"
    searchClearButtonLabel="Limpar busca"
    previewConfig={{ showPreview: false }}
    width="100%"
    height={360}
    onEmojiClick={(emoji) => onEmojiSelect(emoji.emoji)}
  />;
}

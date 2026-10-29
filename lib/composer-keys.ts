/**
 * What Enter means in a composer.
 *
 * Pure, and separate from the hook that uses it, because this is the rule every
 * surface has to agree on and the one that is easy to get subtly wrong: an IME
 * (Japanese, Korean, Chinese) uses Enter to confirm a candidate, and submitting
 * on that keystroke sends a half-composed line.
 */
export interface ComposerKey {
  key: string;
  shiftKey?: boolean;
  /** `KeyboardEvent.isComposing`, or React's `nativeEvent.isComposing`. */
  isComposing?: boolean;
}

/** Enter sends; Shift+Enter inserts a newline; nothing sends while composing. */
export function isSubmitKey(event: ComposerKey): boolean {
  if (event.isComposing) return false;
  return event.key === "Enter" && !event.shiftKey;
}

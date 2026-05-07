import { useEffect } from 'react';
import { parseTimecode } from '../lib/time';

/**
 * Listen for paste events on the document. If the pasted text matches
 * `hh:mm:ss` (with optional `:ff` frame count, which is ignored), call the
 * handler with the parsed seconds and prevent the default paste so it doesn't
 * get inserted into a focused input.
 *
 * If the user pastes something that doesn't look like a timecode, the handler
 * is not called and the paste behaves normally.
 *
 * Pass `enabled: false` to disable (e.g. when in bulk mode or when the active
 * task is a custom-type task).
 */
export function useClipboardTimecode(
  handler: (seconds: number) => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const seconds = parseTimecode(text);
      if (seconds == null) return;
      e.preventDefault();
      handler(seconds);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handler, enabled]);
}

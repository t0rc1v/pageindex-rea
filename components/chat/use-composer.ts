"use client";

import { useCallback, useRef, useState } from "react";

import { isSubmitKey } from "@/lib/composer-keys";

/**
 * The composer rules, shared by the three surfaces that send messages.
 *
 * What is shared is behaviour, not chrome: the draft, the textarea that grows to
 * a ceiling, Enter-to-send (Shift+Enter for a newline, never mid-IME), and
 * clearing the box after a send. Each surface keeps its own layout — `/chat`'s
 * tall card with a document picker, the reader's one row with a locked scope,
 * the panel's compact follow-up — because those differ on purpose.
 *
 * The button next to it stays the surface's own: `/chat` and the panel swap send
 * for stop while an answer streams, the reader's composer has no stream of its
 * own to stop.
 */
export interface Composer {
  value: string;
  /** Callback ref for the textarea — the node stays inside the hook. */
  attach: (node: HTMLTextAreaElement | null) => void;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Send the draft, or nothing when it is blank or the surface is disabled. */
  submit: () => void;
  focus: () => void;
}

export function useComposer({
  onSubmit,
  disabled = false,
  maxHeight = 96,
}: {
  onSubmit: (text: string) => void;
  /** While true, Enter and `submit()` do nothing — hydrating, streaming, indexing. */
  disabled?: boolean;
  /** Ceiling for the auto-grown textarea, in pixels. */
  maxHeight?: number;
}): Composer {
  const [value, setValue] = useState("");
  const node = useRef<HTMLTextAreaElement | null>(null);

  // A callback ref, not the ref object: callers only ever hand the node over.
  const attach = useCallback((element: HTMLTextAreaElement | null) => {
    node.current = element;
  }, []);

  const reset = useCallback(() => {
    setValue("");
    if (node.current) node.current.style.height = "auto";
  }, []);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;

    reset();
    onSubmit(text);
  }, [disabled, onSubmit, reset, value]);

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(event.target.value);

      // Grow with the text, then stop: the box is measured by its own content,
      // so `height: auto` is what makes `scrollHeight` the new height.
      const element = event.target;
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    },
    [maxHeight],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isSubmitKey({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })) {
        return;
      }

      // Make sure the newline Enter would have inserted never lands.
      event.preventDefault();
      submit();
    },
    [submit],
  );

  const focus = useCallback(() => node.current?.focus(), []);

  return { value, attach, onChange, onKeyDown, submit, focus };
}

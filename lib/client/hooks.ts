"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ApiError, apiGet } from "./api";

export interface FetchState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

interface InternalState<T> {
  url: string | null;
  key: string | null;
  data?: T;
  error?: ApiError;
}

/**
 * Minimal GET hook with stale-while-revalidate semantics.
 *
 * Loading is *derived* from whether the settled key matches the requested one,
 * so no state is written synchronously inside the effect. `refreshMs` polls
 * without flashing a spinner — the library uses that for documents that are
 * still indexing.
 */
export function useFetch<T>(
  url: string | null,
  options: {
    refreshMs?: number;
    enabled?: boolean;
    /** Stop polling once the payload says there is nothing left to watch. */
    stopWhen?: (data: T) => boolean;
  } = {},
): FetchState<T> {
  const { refreshMs, enabled = true, stopWhen } = options;
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<InternalState<T>>({ url: null, key: null });
  const mounted = useRef(true);

  const key = url && enabled ? `${url}::${nonce}` : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!url || !key) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      let latest: T | undefined;
      try {
        latest = await apiGet<T>(url, controller.signal);
        if (controller.signal.aborted || !mounted.current) return;
        setState({ url, key, data: latest });
      } catch (caught) {
        if (controller.signal.aborted || !mounted.current) return;
        setState((previous) => ({
          url,
          key,
          data: previous.url === url ? previous.data : undefined,
          error:
            caught instanceof ApiError
              ? caught
              : new ApiError("Network error", "INTERNAL", 0),
        }));
        return;
      }
      const settled = latest !== undefined && stopWhen?.(latest) === true;
      if (refreshMs && !settled && !controller.signal.aborted) {
        timer = setTimeout(() => void run(), refreshMs);
      }
    };

    void run();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [url, key, refreshMs, stopWhen]);

  const current = state.url === url;
  const loading = Boolean(key) && (!current || state.key !== key);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const setData = useCallback(
    (data: T) => setState((previous) => ({ ...previous, data })),
    [],
  );

  return {
    data: current ? state.data : undefined,
    error: current && state.key === key ? state.error : undefined,
    loading,
    reload,
    setData,
  };
}

/**
 * A boolean persisted in localStorage, read through useSyncExternalStore so the
 * preference stays in sync across tabs without writing state inside an effect.
 */
export function useLocalFlag(
  key: string,
  fallback: boolean,
): [boolean, (next: boolean) => void] {
  const subscribe = useCallback((listener: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) listener();
    };
    const onLocal = () => listener();
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCAL_FLAG_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCAL_FLAG_EVENT, onLocal);
    };
  }, [key]);

  const value = useSyncExternalStore(
    subscribe,
    () => {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : raw !== "false";
    },
    () => fallback,
  );

  const set = useCallback(
    (next: boolean) => {
      window.localStorage.setItem(key, String(next));
      window.dispatchEvent(new Event(LOCAL_FLAG_EVENT));
    },
    [key],
  );

  return [value, set];
}

const LOCAL_FLAG_EVENT = "pageindex:local-flag";

/** False during SSR/hydration, true once mounted on the client. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import { ApiError, apiGet } from "./api";

export interface FetchState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

const LOCAL_FLAG_EVENT = "pageindex:local-flag";

/**
 * GET hook backed by TanStack Query.
 *
 * Keeps the original `useFetch` contract (data / error / loading / reload /
 * setData) so call sites stay unchanged, while gaining a shared cache,
 * deduplication across components, and invalidation. Polling is expressed as
 * `refetchInterval`, which can stop itself once the payload settles.
 */
export function useFetch<T>(
  url: string | null,
  options: {
    refreshMs?: number;
    enabled?: boolean;
    /** Stop polling once the payload says there is nothing left to watch. */
    stopWhen?: (data: T) => boolean;
    staleTime?: number;
  } = {},
): FetchState<T> {
  const { refreshMs, enabled = true, stopWhen, staleTime = 30_000 } = options;
  const client = useQueryClient();
  const key = ["pageindex", url] as const;

  const query = useQuery<T, ApiError>({
    queryKey: key,
    queryFn: ({ signal }) => apiGet<T>(url as string, signal),
    enabled: Boolean(url) && enabled,
    staleTime,
    refetchOnWindowFocus: false,
    retry: false,
    refetchInterval: (query) => {
      if (!refreshMs) return false;
      const data = query.state.data as T | undefined;
      if (data !== undefined && stopWhen?.(data)) return false;
      return refreshMs;
    },
  });

  const reload = useCallback(() => {
    if (!url) return;
    void client.invalidateQueries({ queryKey: ["pageindex", url] });
  }, [client, url]);

  const setData = useCallback(
    (data: T) => {
      if (!url) return;
      client.setQueryData(["pageindex", url], data);
    },
    [client, url],
  );

  return {
    data: query.data,
    error: query.error ?? undefined,
    loading: Boolean(url) && enabled && query.isPending,
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

/** False during SSR/hydration, true once mounted on the client. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

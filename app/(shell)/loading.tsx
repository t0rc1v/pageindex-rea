import { Skeleton } from "@/components/ui-kit";

/**
 * Cache Components boundary for the shell.
 *
 * Every page in this group opens with `await auth.protect()`, which reads the
 * request; with `cacheComponents: true` that read has to happen inside a
 * Suspense boundary or `next build` refuses to prerender the route. A
 * segment-level `loading.tsx` supplies one and keeps the shell chrome mounted
 * while the gate resolves.
 */
export default function ShellLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-11/12" />
      <Skeleton className="mt-2 h-3 w-9/12" />
    </div>
  );
}

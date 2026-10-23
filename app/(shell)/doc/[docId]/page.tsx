import { Suspense } from "react";

import { DocView } from "@/components/doc-view";
import { Skeleton } from "@/components/ui-kit";

export const metadata = { title: "Reader — PageIndex Reader" };

export default function DocPage({ params }: PageProps<"/doc/[docId]">) {
  return (
    <Suspense fallback={<ReaderSkeleton />}>
      {params.then(({ docId }) => (
        <DocView docId={docId} />
      ))}
    </Suspense>
  );
}

function ReaderSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Skeleton className="size-8 rounded-lg" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(200px,270px)_minmax(0,1fr)]">
        <div className="hidden flex-col gap-2 border-r border-line p-4 lg:flex">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="h-3.5 w-full" />
          ))}
        </div>
        <div className="mx-auto w-full max-w-3xl px-5 py-6">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-4 h-7 w-3/4" />
          <div className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

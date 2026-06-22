import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-800", className)} />;
}

// ---------------------------------------------------------------------------
// Composite patterns
// ---------------------------------------------------------------------------

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <Skeleton className="mb-4 h-4 w-1/3" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-3", i === rows - 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2 w-1/3" />
      </div>
    </div>
  );
}

type TableCols = 2 | 3 | 4 | 5 | 6;

const COL_CLASSES: Record<TableCols, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: TableCols;
}) {
  const gridClass = COL_CLASSES[cols];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm">
      <div className="border-b border-zinc-800 px-6 py-3">
        <div className={cn("grid gap-4", gridClass)}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-2/3" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-zinc-800/60 px-6">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className={cn("grid gap-4 py-3", gridClass)}>
            {Array.from({ length: cols }).map((__, col) => (
              <Skeleton key={col} className="h-3 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

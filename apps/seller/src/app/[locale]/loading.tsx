import { Skeleton } from '@shopnetic/ui';

export default function Loading() {
  return (
    <div
      data-testid="loading-skeleton"
      className="w-full max-w-4xl mx-auto py-10 px-4 space-y-6 animate-pulse"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-4 w-96 rounded-md" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>

      <div className="rounded-xl border p-6 space-y-4">
        <Skeleton className="h-6 w-48 rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

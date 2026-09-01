import { Spinner } from '@shopnetic/ui';

export default function Loading() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}

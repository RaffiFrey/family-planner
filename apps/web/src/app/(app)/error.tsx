'use client';

import { ErrorState } from '@/components/states';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-10">
      <ErrorState error={error} onRetry={reset} />
    </div>
  );
}

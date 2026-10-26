'use client';

import { ErrorState } from '@/components/states';
import { Card } from '@/components/ui/card';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg p-6">
      <Card>
        <ErrorState error={error} onRetry={reset} />
      </Card>
    </main>
  );
}

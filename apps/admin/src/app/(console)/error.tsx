'use client';

import { ErrorState } from '@/components/states';
import { Card } from '@/components/ui/card';

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card>
      <ErrorState error={error} onRetry={reset} />
    </Card>
  );
}

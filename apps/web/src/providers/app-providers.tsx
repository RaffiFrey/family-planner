'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { Toaster } from 'sonner';
import { makeQueryClient } from '@/lib/query-client';
import { useTheme } from './theme';

function ThemedToaster() {
  const theme = useTheme((s) => s.theme);
  return <Toaster theme={theme} richColors closeButton position="bottom-right" />;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ThemedToaster />
    </QueryClientProvider>
  );
}

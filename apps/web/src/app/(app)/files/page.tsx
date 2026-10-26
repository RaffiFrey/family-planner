import { Suspense } from 'react';
import { LoadingState } from '@/components/states';
import { FilesPage } from '@/features/files/files-page';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={5} />}>
      <FilesPage />
    </Suspense>
  );
}

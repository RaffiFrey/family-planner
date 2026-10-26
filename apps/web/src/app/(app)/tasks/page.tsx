import { Suspense } from 'react';
import { LoadingState } from '@/components/states';
import { TasksPage } from '@/features/tasks/tasks-page';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={5} />}>
      <TasksPage />
    </Suspense>
  );
}

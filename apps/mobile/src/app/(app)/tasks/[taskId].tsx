import { useLocalSearchParams } from 'expo-router';
import { ErrorState, LoadingView } from '@/components/ui';
import { useTask } from '@/features/tasks/hooks';
import { TaskForm } from '@/features/tasks/task-form';

export default function TaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const query = useTask(taskId);
  if (query.data) return <TaskForm key={query.data.id} task={query.data} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <LoadingView />;
}

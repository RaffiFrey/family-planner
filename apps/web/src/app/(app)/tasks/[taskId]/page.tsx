import { redirect } from 'next/navigation';

/** Notification deep links (`/tasks/<id>`) open the task dialog on the list page. */
export default async function Page({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  redirect(`/tasks?task=${encodeURIComponent(taskId)}`);
}

'use client';

import { useParams } from 'next/navigation';
import { ListDetail } from '@/features/lists/list-detail';

export default function Page() {
  const { listId } = useParams<{ listId: string }>();
  return <ListDetail key={listId} listId={listId} />;
}

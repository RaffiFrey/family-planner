'use client';

import { useParams } from 'next/navigation';
import { DocumentDetail } from '@/features/vault/document-detail';

export default function Page() {
  const { documentId } = useParams<{ documentId: string }>();
  return <DocumentDetail key={documentId} documentId={documentId} />;
}

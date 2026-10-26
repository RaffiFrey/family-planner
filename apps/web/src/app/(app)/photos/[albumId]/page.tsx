'use client';

import { useParams } from 'next/navigation';
import { AlbumDetail } from '@/features/photos/album-detail';

export default function Page() {
  const { albumId } = useParams<{ albumId: string }>();
  return <AlbumDetail key={albumId} albumId={albumId} />;
}

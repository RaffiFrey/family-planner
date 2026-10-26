'use client';

import { useParams } from 'next/navigation';
import { TripDetail } from '@/features/travel/trip-detail';

export default function Page() {
  const { tripId } = useParams<{ tripId: string }>();
  return <TripDetail key={tripId} tripId={tripId} />;
}

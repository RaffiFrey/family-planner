import type { Metadata } from 'next';
import { HouseholdDetail } from './household-detail';

export const metadata: Metadata = { title: 'Household' };

export default async function HouseholdPage({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  return <HouseholdDetail householdId={householdId} />;
}

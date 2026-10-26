import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';

export function useMedications(memberId: string) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['health', 'medications.list', { householdId, memberId }],
    queryFn: () => api.health.medications.list({ params: { householdId }, query: { memberId } }),
    enabled: memberId !== '',
  });
}

export function useVaccinations(memberId: string) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['health', 'vaccinations.list', { householdId, memberId }],
    queryFn: () => api.health.vaccinations.list({ params: { householdId }, query: { memberId } }),
    enabled: memberId !== '',
  });
}

export function useCheckups(memberId: string, enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['health', 'checkups.list', { householdId, memberId }],
    queryFn: () => api.health.checkups.list({ params: { householdId, memberId } }),
    enabled: enabled && memberId !== '',
  });
}

import type { HomeAsset, MaintenancePlan } from '@fp/contracts';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { Car, Home, type LucideIcon, Package, WashingMachine } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { dayKey } from '@/features/calendar/dates';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync, showError } from '@/lib/dialogs';
import type { MeterType } from './meters';

export const ASSET_KINDS = ['home', 'vehicle', 'appliance', 'other'] as const;
export type AssetKind = HomeAsset['kind'];

export const KIND_ICONS: Record<AssetKind, LucideIcon> = {
  home: Home,
  vehicle: Car,
  appliance: WashingMachine,
  other: Package,
};

/** Detail fields offered per kind (stored in the free `details` map). */
export const DETAIL_FIELDS: Record<AssetKind, readonly string[]> = {
  home: ['address'],
  vehicle: ['plate', 'model', 'vin'],
  appliance: ['model', 'serial'],
  other: ['model'],
};

export function useAssets() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['home', 'assets.list', { householdId }],
    queryFn: () => api.home.assets.list({ params: { householdId } }),
  });
}

export function useAsset(assetId: string) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['home', 'assets.get', { householdId, assetId }],
    queryFn: () => api.home.assets.get({ params: { householdId, assetId } }),
    enabled: assetId !== '',
  });
}

/** Plans of one asset, or (without assetId) all plans due within `withinDays`. */
export function useMaintenance(opts: { assetId?: string; withinDays?: number }) {
  const { householdId } = useHousehold();
  const dueBefore = opts.withinDays ? dayKey(addDays(new Date(), opts.withinDays)) : undefined;
  return useQuery({
    queryKey: ['home', 'maintenance.list', { householdId, assetId: opts.assetId, dueBefore }],
    queryFn: () =>
      api.home.maintenance.list({
        params: { householdId },
        query: {
          ...(opts.assetId ? { assetId: opts.assetId } : {}),
          ...(dueBefore ? { dueBefore } : {}),
        },
      }),
  });
}

export function useReadings(assetId: string) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['home', 'meters.list', { householdId, assetId }],
    queryFn: () => api.home.meters.list({ params: { householdId, assetId } }),
  });
}

export function useTemplates() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['home', 'maintenance.templates', { householdId }],
    queryFn: () => api.home.maintenance.templates({ params: { householdId } }),
    staleTime: 24 * 60 * 60_000,
  });
}

/** Assets whose warranty ends within the next `days` days. */
export function useWarranties(days = 90) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['home', 'assets.warranties', { householdId, days }],
    queryFn: () => api.home.assets.warranties({ params: { householdId }, query: { days } }),
  });
}

export function useConsumption(assetId: string, meterType: MeterType, period: 'month' | 'year') {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['home', 'meters.consumption', { householdId, assetId, meterType, period }],
    queryFn: () =>
      api.home.meters.consumption({
        params: { householdId, assetId },
        query: { meterType, period },
      }),
  });
}

/** Completion logs of several plans, newest first, with the plan title. */
export function useMaintenanceLogs(plans: readonly MaintenancePlan[]) {
  const { householdId } = useHousehold();
  const results = useQueries({
    queries: plans.map((p) => ({
      queryKey: ['home', 'maintenance.logs', { householdId, planId: p.id }],
      queryFn: () => api.home.maintenance.logs({ params: { householdId, planId: p.id } }),
    })),
  });
  const logs = plans
    .flatMap((p, i) => (results[i]?.data ?? []).map((log) => ({ ...log, planTitle: p.title })))
    .sort((a, b) => b.doneOn.localeCompare(a.doneOn) || b.createdAt.localeCompare(a.createdAt));
  return { logs, isPending: results.some((r) => r.isPending) };
}

export function useDeleteReading() {
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (readingId: string) =>
      api.home.meters.remove({ params: { householdId, readingId } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['home'] }),
    onError: (e) => {
      showError(e, t);
    },
  });
  return (reading: { id: string; value: string; unit: string }) => {
    void confirmAsync(t('m.homeAssets.deleteReading'), `${reading.value} ${reading.unit}`, {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    }).then((ok) => {
      if (ok) mutation.mutate(reading.id);
    });
  };
}

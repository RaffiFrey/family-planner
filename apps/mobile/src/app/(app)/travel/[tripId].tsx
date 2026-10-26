import type { PACKING_TEMPLATE_KEYS, TripItem } from '@fp/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  BedDouble,
  CarFront,
  ListChecks,
  type LucideIcon,
  MapPin,
  Pencil,
  Plane,
  StickyNote,
  Ticket,
  TrainFront,
  Trash2,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Button,
  Card,
  ChipMultiSelect,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  ProgressBar,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useMoney } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { usePackingTemplates, useTravelMutation, useTrip } from '@/features/travel/hooks';
import { asCurrency, groupItinerary } from '@/features/travel/utils';
import { useIntlLocale, useLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

type TemplateKey = (typeof PACKING_TEMPLATE_KEYS)[number];

const KIND_ICONS: Record<TripItem['kind'], LucideIcon> = {
  flight: Plane,
  train: TrainFront,
  car: CarFront,
  hotel: BedDouble,
  activity: Ticket,
  note: StickyNote,
};

/** Trip overview: budget, day-by-day itinerary and the packing list. */
export default function TripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const intlLocale = useIntlLocale();
  const locale = useLocale();
  const fmt = useMoney();
  const { can, household } = useHousehold();
  const writable = can('travel.write');
  const trip = useTrip(tripId);
  const templates = usePackingTemplates(locale);
  const [selected, setSelected] = useState<TemplateKey[]>(['basics']);

  const removeItem = useTravelMutation((householdId, itemId: string) =>
    api.travel.removeItem({ params: { householdId, tripId, itemId } }),
  );
  const removeTrip = useTravelMutation(
    (householdId, _v: undefined) => api.travel.remove({ params: { householdId, tripId } }),
    () => {
      router.back();
    },
  );
  const packing = useTravelMutation(
    (householdId, v: { templates: TemplateKey[]; listName: string | null }) =>
      api.travel.createPackingList({
        params: { householdId, tripId },
        body: {
          templates: v.templates,
          locale,
          ...(v.listName ? { listName: v.listName } : {}),
        },
      }),
    (result) => {
      router.push({ pathname: '/lists/[listId]', params: { listId: result.list.id } });
    },
  );

  if (trip.isPending) return <LoadingView />;
  if (trip.error && !trip.data)
    return <ErrorState error={trip.error} onRetry={() => void trip.refetch()} />;
  const data = trip.data;
  const dayFmt = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeFmt = new Intl.DateTimeFormat(intlLocale, { timeStyle: 'short' });
  const days = groupItinerary(data.items);
  const currency = asCurrency(data.currency, household.currency);

  const deleteItem = async (item: TripItem) => {
    const ok = await confirmAsync(t('m.travel.deleteItem'), item.title, {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) removeItem.mutate(item.id);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl refreshing={trip.isRefetching} onRefresh={() => void trip.refetch()} />
      }
    >
      <Stack.Screen
        options={{
          title: data.name,
          headerRight: () =>
            writable ? (
              <View className="flex-row">
                <IconButton
                  label={t('m.travel.editTrip')}
                  onPress={() => {
                    router.push({ pathname: '/travel/new', params: { tripId } });
                  }}
                >
                  <Pencil size={20} color={colors.text} />
                </IconButton>
                <IconButton
                  label={t('m.travel.deleteTrip')}
                  onPress={() => {
                    void confirmAsync(t('m.travel.deleteTrip'), data.name, {
                      confirmLabel: t('common.delete'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    }).then((ok) => {
                      if (ok) removeTrip.mutate(undefined);
                    });
                  }}
                >
                  <Trash2 size={20} color={colors.text} />
                </IconButton>
              </View>
            ) : null,
        }}
      />
      <Card>
        {data.destination ? (
          <View className="flex-row items-center gap-2">
            <MapPin size={16} color={colors.textMuted} />
            <Text>{data.destination}</Text>
          </View>
        ) : null}
        <Text variant="caption">
          {new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium' }).formatRange(
            new Date(`${data.startDate}T12:00:00`),
            new Date(`${data.endDate}T12:00:00`),
          )}
        </Text>
        {data.notes ? <Text variant="caption">{data.notes}</Text> : null}
      </Card>

      {data.budget ? (
        <Card>
          <Text variant="subheading">{t('m.travel.budget')}</Text>
          {data.budget.budgetMinor !== null ? (
            <>
              <ProgressBar
                ratio={
                  data.budget.budgetMinor > 0 ? data.budget.spentMinor / data.budget.budgetMinor : 0
                }
                tone={
                  data.budget.remainingMinor !== null && data.budget.remainingMinor < 0
                    ? 'danger'
                    : 'primary'
                }
                label={t('m.travel.budget')}
              />
              <Text variant="caption">
                {t('m.travel.spentOf', {
                  spent: fmt(data.budget.spentMinor, currency),
                  budget: fmt(data.budget.budgetMinor, currency),
                })}
              </Text>
            </>
          ) : (
            <Text variant="caption">
              {t('m.travel.spent', { spent: fmt(data.budget.spentMinor, currency) })}
            </Text>
          )}
          <Text variant="caption">{t('m.travel.financeTag', { tag: data.financeTag })}</Text>
        </Card>
      ) : null}

      <SectionHeader
        title={t('m.travel.itinerary')}
        action={
          writable ? (
            <Button
              size="sm"
              variant="ghost"
              title={t('common.add')}
              onPress={() => {
                router.push({ pathname: '/travel/item-new', params: { tripId } });
              }}
            />
          ) : null
        }
      />
      {days.length === 0 ? (
        <EmptyState title={t('m.travel.noItems')} />
      ) : (
        days.map((group) => (
          <View key={group.day ?? 'undated'} className="gap-2">
            <Text variant="label" accessibilityRole="header">
              {group.day ? dayFmt.format(new Date(`${group.day}T12:00:00`)) : t('m.travel.undated')}
            </Text>
            <RowGroup>
              {group.items.map((item, i) => {
                const Icon = KIND_ICONS[item.kind];
                return (
                  <View key={item.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      title={item.title}
                      subtitle={[
                        item.startAt ? timeFmt.format(new Date(item.startAt)) : null,
                        item.location,
                        item.confirmationCode
                          ? t('m.travel.code', { code: item.confirmationCode })
                          : null,
                        item.attachmentFileIds.length > 0
                          ? t('m.travel.attachmentCount', { count: item.attachmentFileIds.length })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      left={<Icon size={22} color={colors.primary} />}
                      {...(writable
                        ? {
                            onPress: () => {
                              router.push({
                                pathname: '/travel/item-new',
                                params: { tripId, itemId: item.id },
                              });
                            },
                            onLongPress: () => void deleteItem(item),
                            accessibilityHint: t('m.travel.itemHint'),
                          }
                        : {})}
                    />
                  </View>
                );
              })}
            </RowGroup>
          </View>
        ))
      )}

      <SectionHeader title={t('m.travel.packing')} />
      {data.packingListId ? (
        <RowGroup>
          <ListRow
            title={t('m.travel.openPackingList')}
            left={<ListChecks size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              if (data.packingListId)
                router.push({
                  pathname: '/lists/[listId]',
                  params: { listId: data.packingListId },
                });
            }}
          />
        </RowGroup>
      ) : null}
      {writable && can('lists.write') ? (
        <Card>
          <Text variant="caption">
            {data.packingListId ? t('m.travel.extendPacking') : t('m.travel.createPackingHint')}
          </Text>
          <ChipMultiSelect
            label={t('m.travel.templates')}
            value={selected}
            onChange={setSelected}
            options={(templates.data ?? []).map((tpl) => ({ value: tpl.key, label: tpl.name }))}
          />
          <Button
            title={data.packingListId ? t('m.travel.addToPacking') : t('m.travel.createPacking')}
            variant="secondary"
            loading={packing.isPending}
            disabled={selected.length === 0 && !!data.packingListId}
            onPress={() => {
              packing.mutate({
                templates: selected,
                listName: data.packingListId
                  ? null
                  : t('m.travel.packingListName', { name: data.name }),
              });
            }}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

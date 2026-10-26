import { Bell, BellOff } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  ChipSelect,
  Divider,
  IconButton,
  ListRow,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useHousehold, useMembers } from '@/features/household/household';
import { showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { usePlaceSubscriptions, useSubscriptionMutations } from './hooks';

const ANYONE = 'anyone';

/** "Notify me when … arrives at / leaves this place" for one place. */
export function PlaceSubscriptions({ placeId }: { placeId: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { me } = useHousehold();
  const members = useMembers().filter((m) => m.id !== me.id);
  const subscriptions = usePlaceSubscriptions();
  const { subscribe, unsubscribe } = useSubscriptionMutations();
  const mine = (subscriptions.data ?? []).filter((s) => s.placeId === placeId);
  const taken = new Set(mine.map((s) => s.targetMemberId ?? ANYONE));
  const options = [
    { value: ANYONE, label: t('m.location.anyone') },
    ...members.map((m) => ({ value: m.id, label: m.displayName, color: m.color })),
  ].filter((o) => !taken.has(o.value));
  const [target, setTarget] = useState<string>(ANYONE);
  const selected = options.some((o) => o.value === target) ? target : (options[0]?.value ?? null);
  const nameOf = (id: string | null) =>
    id === null ? t('m.location.anyone') : (members.find((m) => m.id === id)?.displayName ?? '?');

  return (
    <View className="gap-2">
      <SectionHeader title={t('m.location.notifications')} />
      <Text variant="caption">{t('m.location.notificationsHint')}</Text>
      {mine.length > 0 ? (
        <RowGroup>
          {mine.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={nameOf(s.targetMemberId)}
                subtitle={t('m.location.arriveLeave')}
                left={<Bell size={20} color={colors.primary} />}
                right={
                  <IconButton
                    label={t('m.location.unsubscribe', { name: nameOf(s.targetMemberId) })}
                    onPress={() => {
                      unsubscribe.mutate(s.id, {
                        onError: (e) => {
                          showError(e, t);
                        },
                      });
                    }}
                  >
                    <BellOff size={20} color={colors.textMuted} />
                  </IconButton>
                }
              />
            </View>
          ))}
        </RowGroup>
      ) : null}
      {selected !== null ? (
        <>
          <ChipSelect
            label={t('m.location.notifyAbout')}
            options={options}
            value={selected}
            onChange={setTarget}
          />
          <Button
            variant="secondary"
            title={t('m.location.subscribe')}
            icon={<Bell size={16} color={colors.text} />}
            loading={subscribe.isPending}
            onPress={() => {
              subscribe.mutate(
                { placeId, targetMemberId: selected === ANYONE ? null : selected },
                {
                  onError: (e) => {
                    showError(e, t);
                  },
                },
              );
            }}
          />
        </>
      ) : null}
    </View>
  );
}

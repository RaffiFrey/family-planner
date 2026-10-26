import type { CheckupCode } from '@fp/domain/care';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Bell, BellOff, CalendarClock, Pill, Plus, Syringe } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { ModuleGate } from '@/components/gates';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { dayKey } from '@/features/calendar/dates';
import { useCheckups, useMedications, useVaccinations } from '@/features/health/hooks';
import { MemberPicker } from '@/features/health/member-picker';
import { isChildRole } from '@/features/health/schedule';
import { useHousehold, useMembers } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

export default function HealthScreen() {
  return (
    <ModuleGate action="health.read">
      <Health />
    </ModuleGate>
  );
}

const STATUS_TONE = {
  upcoming: 'bg-surface-muted text-muted',
  due: 'bg-warning text-white',
  overdue: 'bg-danger text-white',
  missed: 'bg-surface-muted text-muted',
  done: 'bg-success text-white',
} as const;

function Health() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { householdId, me, can } = useHousehold();
  const members = useMembers();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState(me.id);
  const member = members.find((m) => m.id === memberId) ?? me;
  const writable = can('health.write');
  const medications = useMedications(member.id);
  const vaccinations = useVaccinations(member.id);
  const showCheckups = isChildRole(member.role) || member.birthday !== null;
  const checkups = useCheckups(member.id, showCheckups);

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dateTimeFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const fmtDay = (key: string) => dateFmt.format(new Date(`${key}T12:00:00`));

  const toggleCheckup = useMutation({
    mutationFn: (c: { code: CheckupCode; done: boolean }) => {
      const params = { householdId, memberId: member.id, code: c.code };
      return c.done
        ? api.health.checkups.unmark({ params })
        : api.health.checkups.markDone({ params, body: { doneOn: dayKey(new Date()) } });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['health'] }),
    onError: (e) => {
      showError(e, t);
    },
  });

  const refreshing = medications.isRefetching || vaccinations.isRefetching;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void queryClient.invalidateQueries({ queryKey: ['health'] })}
        />
      }
    >
      <MemberPicker members={members} value={member.id} onChange={setMemberId} />

      <SectionHeader
        title={t('m.health.medications')}
        action={
          writable ? (
            <Button
              size="sm"
              variant="ghost"
              title={t('m.health.addMedication')}
              icon={<Plus size={16} color={colors.primary} />}
              onPress={() => {
                router.push({ pathname: '/health/medication', params: { memberId: member.id } });
              }}
            />
          ) : null
        }
      />
      {medications.isPending ? (
        <LoadingView />
      ) : medications.error && !medications.data ? (
        <ErrorState error={medications.error} onRetry={() => void medications.refetch()} />
      ) : medications.data.length === 0 ? (
        <EmptyState title={t('m.health.noMedications')} />
      ) : (
        <RowGroup>
          {medications.data.map((m, i) => {
            const times = m.times.join(', ');
            const next = m.nextAt
              ? dateTimeFmt.format(new Date(m.nextAt))
              : t('m.health.planEnded');
            return (
              <View key={m.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={m.dose ? `${m.name} · ${m.dose}` : m.name}
                  subtitle={`${m.reminders ? t('m.health.remindersAt', { times }) : t('m.health.noReminders', { times })}\n${t('m.health.nextIntake', { when: next })}`}
                  left={<Pill size={22} color={colors.primary} />}
                  right={
                    m.reminders ? (
                      <Bell
                        size={18}
                        color={colors.primary}
                        accessibilityLabel={t('m.health.reminderOn')}
                      />
                    ) : (
                      <BellOff
                        size={18}
                        color={colors.textMuted}
                        accessibilityLabel={t('m.health.reminderOff')}
                      />
                    )
                  }
                  {...(writable
                    ? {
                        chevron: true,
                        onPress: () => {
                          router.push({
                            pathname: '/health/medication',
                            params: { memberId: member.id, medicationId: m.id },
                          });
                        },
                      }
                    : {})}
                />
              </View>
            );
          })}
        </RowGroup>
      )}

      {medications.data && medications.data.length > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          title={t('m.health.openSchedule')}
          icon={<CalendarClock size={16} color={colors.text} />}
          onPress={() => {
            router.push({ pathname: '/health/schedule', params: { memberId: member.id } });
          }}
        />
      ) : null}

      <SectionHeader
        title={t('m.health.vaccinations')}
        action={
          writable ? (
            <Button
              size="sm"
              variant="ghost"
              title={t('m.health.addVaccination')}
              icon={<Plus size={16} color={colors.primary} />}
              onPress={() => {
                router.push({ pathname: '/health/vaccination', params: { memberId: member.id } });
              }}
            />
          ) : null
        }
      />
      {vaccinations.isPending ? (
        <LoadingView />
      ) : vaccinations.error && !vaccinations.data ? (
        <ErrorState error={vaccinations.error} onRetry={() => void vaccinations.refetch()} />
      ) : vaccinations.data.length === 0 ? (
        <EmptyState title={t('m.health.noVaccinations')} />
      ) : (
        <RowGroup>
          {vaccinations.data.map((v, i) => (
            <View key={v.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={v.dose ? `${v.vaccine} (${v.dose})` : v.vaccine}
                subtitle={[
                  t('m.health.givenOn', { date: fmtDay(v.givenOn) }),
                  v.nextDueOn ? t('m.health.nextDue', { date: fmtDay(v.nextDueOn) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                left={<Syringe size={22} color={colors.primary} />}
                {...(writable
                  ? {
                      chevron: true,
                      onPress: () => {
                        router.push({
                          pathname: '/health/vaccination',
                          params: { memberId: member.id, vaccinationId: v.id },
                        });
                      },
                    }
                  : {})}
              />
            </View>
          ))}
        </RowGroup>
      )}

      {showCheckups ? (
        <>
          <SectionHeader title={t('m.health.checkups')} />
          {checkups.isPending ? (
            <LoadingView />
          ) : checkups.error && !checkups.data ? (
            <ErrorState error={checkups.error} onRetry={() => void checkups.refetch()} />
          ) : checkups.data.checkups.length === 0 ? (
            <EmptyState title={t('m.health.noBirthday')} message={t('m.health.noBirthdayHint')} />
          ) : (
            <RowGroup>
              {checkups.data.checkups.map((c, i) => {
                const done = c.status === 'done';
                const tone = STATUS_TONE[c.status];
                return (
                  <View key={c.code}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      title={c.code}
                      subtitle={
                        done && c.doneOn
                          ? t('m.health.checkupDone', { date: fmtDay(c.doneOn) })
                          : t('m.health.checkupWindow', { from: fmtDay(c.from), to: fmtDay(c.to) })
                      }
                      right={
                        <View className={`rounded-full px-2 py-0.5 ${tone.split(' ')[0] ?? ''}`}>
                          <Text className={`text-xs font-semibold ${tone.split(' ')[1] ?? ''}`}>
                            {t(`m.health.status.${c.status}`)}
                          </Text>
                        </View>
                      }
                      {...(writable
                        ? {
                            accessibilityHint: done
                              ? t('m.health.unmarkHint')
                              : t('m.health.markHint'),
                            onPress: () => {
                              void confirmAsync(
                                done
                                  ? t('m.health.unmarkTitle', { code: c.code })
                                  : t('m.health.markTitle', { code: c.code }),
                                undefined,
                                {
                                  confirmLabel: t('common.confirm'),
                                  cancelLabel: t('common.cancel'),
                                },
                              ).then((ok) => {
                                if (ok) toggleCheckup.mutate({ code: c.code, done });
                              });
                            },
                          }
                        : {})}
                    />
                  </View>
                );
              })}
            </RowGroup>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

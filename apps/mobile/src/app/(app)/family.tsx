import { apiQuery } from '@fp/api-client';
import type { Member } from '@fp/contracts';
import { assignableRoles, type MemberRole } from '@fp/domain/permissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Copy, Share2, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Share, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  ChipSelect,
  Divider,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { useHousehold, useHouseholdDetail } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync, showError } from '@/lib/dialogs';
import { inviteLink } from '@/lib/links';
import { useColors } from '@/lib/theme';

type InviteRole = Exclude<MemberRole, 'owner'>;

/** Members, invite links (share/copy), open invitations and managed child profiles. */
export default function FamilyScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { householdId, household, me, can } = useHousehold();
  const queryClient = useQueryClient();
  const detail = useHouseholdDetail();
  const canInvite = can('members.invite');
  const canManage = can('members.manage');
  const invitations = useQuery({
    ...apiQuery(api, 'households', 'listInvitations', { params: { householdId } }),
    enabled: canInvite,
  });
  const roles = assignableRoles(me.role).filter((r): r is InviteRole => r !== 'owner');
  const [role, setRole] = useState<InviteRole>(
    roles.includes('adult') ? 'adult' : (roles[0] ?? 'adult'),
  );
  const [childName, setChildName] = useState('');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['households'] });

  const shareInvite = async (token: string) => {
    const link = inviteLink(token);
    await Share.share({
      message: t('m.family.inviteMessage', { household: household.name, link }),
    });
  };

  const invite = useMutation({
    mutationFn: () => api.households.createInvitation({ params: { householdId }, body: { role } }),
    onSuccess: async (inv) => {
      await invalidate();
      await shareInvite(inv.token);
    },
    onError: (e) => {
      showError(e, t);
    },
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      api.households.revokeInvitation({ params: { householdId, invitationId } }),
    onSettled: invalidate,
  });
  const addChild = useMutation({
    mutationFn: () =>
      api.households.createManagedMember({
        params: { householdId },
        body: { displayName: childName.trim(), role: 'child' },
      }),
    onSuccess: () => {
      setChildName('');
    },
    onSettled: invalidate,
    onError: (e) => {
      showError(e, t);
    },
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      api.households.removeMember({ params: { householdId, memberId } }),
    onSettled: invalidate,
    onError: (e) => {
      showError(e, t);
    },
  });

  const onMemberPress = (m: Member) => {
    const isMe = m.id === me.id;
    if (!isMe && !canManage) return;
    void confirmAsync(m.displayName, t(`roles.${m.role}`), {
      confirmLabel: isMe ? t('m.family.leave') : t('m.family.remove'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    }).then((ok) => {
      if (ok) removeMember.mutate(m.id);
    });
  };

  if (detail.isPending) return <LoadingView />;
  if (detail.error && !detail.data)
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const openInvites = (invitations.data ?? []).filter((i) => !i.acceptedAt);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()} />
      }
    >
      <Text variant="heading">{household.name}</Text>
      <SectionHeader title={t('m.family.members', { count: detail.data.members.length })} />
      <RowGroup>
        {detail.data.members.map((m, i) => (
          <View key={m.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={m.id === me.id ? `${m.displayName} (${t('m.family.you')})` : m.displayName}
              subtitle={[t(`roles.${m.role}`), m.isManaged ? t('m.family.managed') : null]
                .filter(Boolean)
                .join(' · ')}
              left={<Avatar name={m.displayName} color={m.color} />}
              {...(m.id === me.id || canManage
                ? {
                    onPress: () => {
                      onMemberPress(m);
                    },
                  }
                : {})}
            />
          </View>
        ))}
      </RowGroup>

      {canInvite ? (
        <Card>
          <Text variant="subheading">{t('m.family.invite')}</Text>
          <Text variant="caption">{t('m.family.inviteHint')}</Text>
          <ChipSelect
            label={t('m.family.role')}
            options={roles.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
            value={role}
            onChange={setRole}
          />
          <Button
            title={t('m.family.createInvite')}
            icon={<UserPlus size={18} color={colors.primaryText} />}
            loading={invite.isPending}
            onPress={() => {
              invite.mutate();
            }}
          />
        </Card>
      ) : null}

      {openInvites.length > 0 ? (
        <>
          <SectionHeader title={t('m.family.openInvites')} />
          <RowGroup>
            {openInvites.map((inv, i) => (
              <View key={inv.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={inv.email ?? t(`roles.${inv.role}`)}
                  subtitle={t('m.family.expires', {
                    date: dateFmt.format(new Date(inv.expiresAt)),
                  })}
                  right={
                    <View className="flex-row">
                      <IconButton
                        label={t('m.family.copyLink')}
                        onPress={() => {
                          void Clipboard.setStringAsync(inviteLink(inv.token));
                        }}
                      >
                        <Copy size={18} color={colors.text} />
                      </IconButton>
                      <IconButton
                        label={t('m.family.share')}
                        onPress={() => void shareInvite(inv.token)}
                      >
                        <Share2 size={18} color={colors.text} />
                      </IconButton>
                    </View>
                  }
                  onLongPress={() => {
                    void confirmAsync(t('m.family.revoke'), undefined, {
                      confirmLabel: t('m.family.revoke'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    }).then((ok) => {
                      if (ok) revoke.mutate(inv.id);
                    });
                  }}
                />
              </View>
            ))}
          </RowGroup>
        </>
      ) : null}

      {canManage ? (
        <Card>
          <Text variant="subheading">{t('m.family.addChild')}</Text>
          <Text variant="caption">{t('m.family.addChildHint')}</Text>
          <TextField label={t('common.name')} value={childName} onChangeText={setChildName} />
          <Button
            variant="secondary"
            title={t('common.add')}
            disabled={childName.trim() === ''}
            loading={addChild.isPending}
            onPress={() => {
              addChild.mutate();
            }}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

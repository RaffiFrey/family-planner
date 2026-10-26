import type { VaultDocument, VaultDocumentType } from '@fp/contracts';
import type { Visibility } from '@fp/domain/permissions';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ChipMultiSelect,
  ChipSelect,
  DateField,
  ErrorState,
  LoadingView,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { useHousehold, useMembers } from '@/features/household/household';
import {
  LEAD_DAY_PRESETS,
  leadDaysFor,
  MAX_LEAD_DAYS,
  parseLocalDate,
  parseTags,
  type ReminderMode,
  reminderModeOf,
  toLocalDate,
} from '@/features/vault/expiry';
import { useVaultDocument, useVaultMutations } from '@/features/vault/hooks';
import { useTypeLabel, VAULT_TYPES } from '@/features/vault/ui';
import { showError } from '@/lib/dialogs';

const VISIBILITIES: readonly Visibility[] = ['household', 'private', 'members'];

/** Create (no param) or edit (`documentId`) a vault document. */
export default function VaultEditScreen() {
  const { documentId } = useLocalSearchParams<{ documentId?: string }>();
  const doc = useVaultDocument(documentId);
  if (documentId && doc.isPending) return <LoadingView />;
  if (documentId && doc.isError && !doc.data)
    return <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />;
  return <VaultForm key={doc.data?.id ?? 'new'} doc={documentId ? doc.data : undefined} />;
}

function VaultForm({ doc }: { doc: VaultDocument | undefined }) {
  const { t } = useTranslation();
  const typeLabel = useTypeLabel();
  const { me } = useHousehold();
  const members = useMembers();
  const { create, update } = useVaultMutations();
  const [type, setType] = useState<VaultDocumentType>(doc?.type ?? 'id_card');
  const [title, setTitle] = useState(doc?.title ?? '');
  const [holder, setHolder] = useState<string>(doc?.holderMemberId ?? 'none');
  const [issuer, setIssuer] = useState(doc?.issuer ?? '');
  const [number, setNumber] = useState(doc?.documentNumber ?? '');
  const [issuedOn, setIssuedOn] = useState<Date | null>(
    doc?.issuedOn ? parseLocalDate(doc.issuedOn) : null,
  );
  const [expiresOn, setExpiresOn] = useState<Date | null>(
    doc?.expiresOn ? parseLocalDate(doc.expiresOn) : null,
  );
  const [tags, setTags] = useState(doc?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(doc?.notes ?? '');
  const [visibility, setVisibility] = useState<Visibility>(doc?.visibility ?? 'household');
  const [sharedWith, setSharedWith] = useState<string[]>(doc?.sharedWith ?? []);
  const [reminderMode, setReminderMode] = useState<ReminderMode>(
    reminderModeOf(doc?.reminderLeadDays ?? null),
  );
  const [leadDays, setLeadDays] = useState<string[]>((doc?.reminderLeadDays ?? []).map(String));
  const [submitted, setSubmitted] = useState(false);

  const titleError = submitted && title.trim() === '' ? t('m.vault.titleRequired') : undefined;
  const dateError =
    issuedOn && expiresOn && expiresOn < issuedOn ? t('m.vault.expiryBeforeIssue') : undefined;
  const leadDaysError =
    reminderMode === 'custom' && leadDays.length === 0 ? t('m.vault.chooseLeadDays') : undefined;
  const busy = create.isPending || update.isPending;

  const submit = () => {
    setSubmitted(true);
    if (title.trim() === '' || dateError || leadDaysError) return;
    const body = {
      type,
      title: title.trim(),
      holderMemberId: holder === 'none' ? null : holder,
      issuer: issuer.trim() || null,
      documentNumber: number.trim() || null,
      issuedOn: issuedOn ? toLocalDate(issuedOn) : null,
      expiresOn: expiresOn ? toLocalDate(expiresOn) : null,
      notes: notes.trim() || null,
      tags: parseTags(tags),
      reminderLeadDays: leadDaysFor(reminderMode, leadDays.map(Number)),
      visibility,
      sharedWith: visibility === 'members' ? sharedWith.filter((id) => id !== me.id) : null,
    };
    const onError = (e: unknown) => {
      showError(e, t);
    };
    if (doc) {
      update.mutate(
        { id: doc.id, body },
        {
          onSuccess: () => {
            router.back();
          },
          onError,
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: (created) => {
          router.replace({ pathname: '/vault/[documentId]', params: { documentId: created.id } });
        },
        onError,
      });
    }
  };

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{ title: doc ? t('m.vault.editDocument') : t('m.vault.newDocument') }}
      />
      <ChipSelect
        label={t('m.vault.type')}
        options={VAULT_TYPES.map((ty) => ({ value: ty, label: typeLabel(ty) }))}
        value={type}
        onChange={(ty) => {
          if (title.trim() === '' || title === typeLabel(type)) setTitle(typeLabel(ty));
          setType(ty);
        }}
      />
      <TextField
        label={t('m.vault.titleLabel')}
        value={title}
        onChangeText={setTitle}
        placeholder={t('m.vault.titlePlaceholder')}
        error={titleError}
        maxLength={200}
      />
      <ChipSelect
        label={t('m.vault.holder')}
        options={[
          { value: 'none', label: t('m.vault.noHolder') },
          ...members.map((m) => ({ value: m.id, label: m.displayName, color: m.color })),
        ]}
        value={holder}
        onChange={setHolder}
      />
      <TextField
        label={t('m.vault.documentNumber')}
        value={number}
        onChangeText={setNumber}
        autoCapitalize="characters"
        autoCorrect={false}
        hint={t('m.vault.documentNumberHint')}
        maxLength={100}
      />
      <TextField
        label={t('m.vault.issuer')}
        value={issuer}
        onChangeText={setIssuer}
        placeholder={t('m.vault.issuerPlaceholder')}
        maxLength={200}
      />
      <DateField label={t('m.vault.issuedOn')} value={issuedOn} onChange={setIssuedOn} clearable />
      <DateField
        label={t('m.vault.expiresOn')}
        value={expiresOn}
        onChange={setExpiresOn}
        clearable
        error={dateError}
      />
      <ChipSelect<ReminderMode>
        label={t('m.vault.reminders')}
        options={[
          { value: 'default', label: t('m.vault.remindersDefault') },
          { value: 'custom', label: t('m.vault.remindersCustom') },
          { value: 'none', label: t('m.vault.remindersNone') },
        ]}
        value={reminderMode}
        onChange={setReminderMode}
      />
      {reminderMode === 'custom' ? (
        <>
          <ChipMultiSelect
            label={t('m.vault.leadDays', { max: MAX_LEAD_DAYS })}
            options={LEAD_DAY_PRESETS.map((d) => ({
              value: String(d),
              label: t('m.vault.daysBefore', { count: d }),
            }))}
            value={leadDays}
            onChange={(next) => {
              setLeadDays(next.slice(-MAX_LEAD_DAYS));
            }}
          />
          {leadDaysError && submitted ? (
            <Text variant="caption" className="text-danger" accessibilityLiveRegion="polite">
              {leadDaysError}
            </Text>
          ) : null}
        </>
      ) : (
        <Text variant="caption">
          {reminderMode === 'default'
            ? t('m.vault.remindersDefaultHint')
            : t('m.vault.remindersNoneHint')}
        </Text>
      )}
      <TextField
        label={t('m.vault.tags')}
        value={tags}
        onChangeText={setTags}
        placeholder={t('m.vault.tagsPlaceholder')}
      />
      <TextField
        label={t('m.vault.notes')}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={5000}
      />
      <ChipSelect
        label={t('m.common.visibility')}
        options={VISIBILITIES.map((v) => ({ value: v, label: t(`visibility.${v}`) }))}
        value={visibility}
        onChange={setVisibility}
      />
      {visibility === 'members' ? (
        <ChipMultiSelect
          options={members
            .filter((m) => m.id !== me.id)
            .map((m) => ({ value: m.id, label: m.displayName, color: m.color }))}
          value={sharedWith}
          onChange={setSharedWith}
        />
      ) : null}
      <Button title={t('common.save')} loading={busy} onPress={submit} />
    </ScreenScroll>
  );
}

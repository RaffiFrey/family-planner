import { TRIP_ITEM_KINDS, type TripItem } from '@fp/contracts';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Camera, FileUp, Paperclip, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import {
  Button,
  ChipSelect,
  DateField,
  Divider,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { pickDocument, pickImage, type PickedFile } from '@/features/files/file-transfer';
import { useHousehold } from '@/features/household/household';
import { uploadAndWait } from '@/features/photos/upload';
import { useFileMeta, useTravelMutation, useTrip } from '@/features/travel/hooks';
import { api } from '@/lib/api';
import { notify, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

type Kind = (typeof TRIP_ITEM_KINDS)[number];

/** Add (or edit with `?itemId=`) a flight, train, hotel, activity or note, with attachments. */
export default function TripItemScreen() {
  const { tripId, itemId } = useLocalSearchParams<{ tripId: string; itemId?: string }>();
  const { t } = useTranslation();
  const trip = useTrip(tripId);
  if (itemId && trip.isPending) return <LoadingView />;
  const item = itemId ? trip.data?.items.find((i) => i.id === itemId) : undefined;
  if (itemId && !item) return <ErrorState error={trip.error ?? new Error('not found')} />;
  return (
    <>
      {item ? <Stack.Screen options={{ title: t('m.travel.editItem') }} /> : null}
      <ItemForm tripId={tripId} item={item} />
    </>
  );
}

function Attachment({ fileId, onRemove }: { fileId: string; onRemove: () => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId } = useHousehold();
  const meta = useFileMeta(fileId);
  const name = meta.data?.name ?? t('common.loading');
  // Two sibling buttons (open / remove) instead of a button nested in a pressable row.
  return (
    <View className="flex-row items-center pr-2">
      <View className="flex-1">
        <ListRow
          title={name}
          subtitle={
            meta.data && meta.data.status !== 'ready'
              ? t(`m.files.status.${meta.data.status}`)
              : null
          }
          left={<Paperclip size={18} color={colors.textMuted} />}
          onPress={() => {
            void api.storage
              .download({ params: { householdId, fileId } })
              .then((l) => WebBrowser.openBrowserAsync(l.url))
              .catch((e: unknown) => {
                showError(e, t);
              });
          }}
          accessibilityHint={t('m.travel.openAttachment')}
        />
      </View>
      <IconButton label={t('m.travel.removeAttachment', { name })} onPress={onRemove}>
        <X size={18} color={colors.textMuted} />
      </IconButton>
    </View>
  );
}

function ItemForm({ tripId, item }: { tripId: string; item: TripItem | undefined }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId, can } = useHousehold();
  const [kind, setKind] = useState<Kind>(item?.kind ?? 'activity');
  const [title, setTitle] = useState(item?.title ?? '');
  const [startAt, setStartAt] = useState<Date | null>(
    item?.startAt ? new Date(item.startAt) : null,
  );
  const [endAt, setEndAt] = useState<Date | null>(item?.endAt ? new Date(item.endAt) : null);
  const [location, setLocation] = useState(item?.location ?? '');
  const [code, setCode] = useState(item?.confirmationCode ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [attachments, setAttachments] = useState<string[]>(item?.attachmentFileIds ?? []);
  const [errors, setErrors] = useState<{ title?: string; end?: string }>({});

  const save = useTravelMutation(
    (hid, body: Parameters<typeof api.travel.addItem>[0]['body']) =>
      item
        ? api.travel.updateItem({ params: { householdId: hid, tripId, itemId: item.id }, body })
        : api.travel.addItem({ params: { householdId: hid, tripId }, body }),
    () => {
      router.back();
    },
  );
  const remove = useTravelMutation(
    (hid, _v: undefined) =>
      api.travel.removeItem({ params: { householdId: hid, tripId, itemId: item?.id ?? '' } }),
    () => {
      router.back();
    },
  );
  const attach = useMutation({
    mutationFn: async (pick: () => Promise<PickedFile | null>) => {
      const picked = await pick();
      if (!picked) return null;
      return uploadAndWait(householdId, t('m.travel.folder'), picked);
    },
    onSuccess: (file) => {
      if (file === null) return;
      setAttachments((a) => [...a, file.id]);
    },
    onError: (e) => {
      showError(e, t);
    },
  });

  const submit = () => {
    const next: typeof errors = {};
    if (title.trim() === '') next.title = t('m.travel.titleRequired');
    if (startAt && endAt && endAt < startAt) next.end = t('m.travel.endBeforeStart');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (attach.isPending) {
      notify(t('m.files.uploading'));
      return;
    }
    const opt = (s: string) => (s.trim() === '' ? null : s.trim());
    save.mutate({
      kind,
      title: title.trim(),
      startAt: startAt ? startAt.toISOString() : null,
      endAt: endAt ? endAt.toISOString() : null,
      location: opt(location),
      confirmationCode: opt(code),
      notes: opt(notes),
      attachmentFileIds: attachments,
    });
  };

  return (
    <ScreenScroll>
      <ChipSelect
        label={t('m.travel.kind')}
        value={kind}
        onChange={setKind}
        options={TRIP_ITEM_KINDS.map((k) => ({ value: k, label: t(`m.travel.kinds.${k}`) }))}
      />
      <TextField
        label={t('m.travel.itemTitle')}
        value={title}
        onChangeText={setTitle}
        error={errors.title}
        autoFocus={!item}
      />
      <DateField
        label={t('m.travel.startAt')}
        value={startAt}
        onChange={setStartAt}
        mode="datetime"
        clearable
      />
      <DateField
        label={t('m.travel.endAt')}
        value={endAt}
        onChange={setEndAt}
        mode="datetime"
        clearable
        error={errors.end}
      />
      <TextField
        label={t('m.calendar.location')}
        value={location}
        onChangeText={setLocation}
        placeholder={t('common.optional')}
      />
      <TextField
        label={t('m.travel.confirmationCode')}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        placeholder={t('common.optional')}
      />
      <TextField label={t('m.finance.notes')} value={notes} onChangeText={setNotes} multiline />

      <Text variant="label">{t('m.travel.attachments')}</Text>
      {attachments.length > 0 ? (
        <RowGroup>
          {attachments.map((id, i) => (
            <View key={id}>
              {i > 0 ? <Divider /> : null}
              <Attachment
                fileId={id}
                onRemove={() => {
                  setAttachments((a) => a.filter((x) => x !== id));
                }}
              />
            </View>
          ))}
        </RowGroup>
      ) : null}
      {can('storage.write') && attachments.length < 10 ? (
        <View className="flex-row gap-2">
          {Platform.OS !== 'web' ? (
            <Button
              className="flex-1"
              size="sm"
              variant="secondary"
              title={t('m.files.camera')}
              icon={<Camera size={16} color={colors.text} />}
              disabled={attach.isPending}
              onPress={() => {
                attach.mutate(() => pickImage('camera'));
              }}
            />
          ) : null}
          <Button
            className="flex-1"
            size="sm"
            variant="secondary"
            title={attach.isPending ? t('m.files.uploading') : t('m.travel.attachFile')}
            icon={<FileUp size={16} color={colors.text} />}
            loading={attach.isPending}
            onPress={() => {
              attach.mutate(pickDocument);
            }}
          />
        </View>
      ) : null}

      <Button title={t('common.save')} loading={save.isPending} onPress={submit} />
      {item ? (
        <Button
          title={t('m.travel.deleteItem')}
          variant="ghost"
          loading={remove.isPending}
          onPress={() => {
            remove.mutate(undefined);
          }}
        />
      ) : null}
    </ScreenScroll>
  );
}

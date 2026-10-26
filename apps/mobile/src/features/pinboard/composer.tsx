import { Camera, FileText, ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Button, ChipSelect, DateField, IconButton, Text, TextField } from '@/components/ui';
import { type PickedFile, pickDocument, pickImage } from '@/features/files/file-transfer';
import { useHousehold } from '@/features/household/household';
import { showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { uploadAttachment } from './upload';
import { POST_COLOR_HEX, POST_COLORS, type PostColor, usePostMutations } from './hooks';

interface Attached {
  id: string;
  name: string;
}

const MAX_ATTACHMENTS = 10;

/** End of the chosen day, so a note "bis Freitag" stays visible all Friday. */
export function expiryIso(day: Date): string {
  const d = new Date(day);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

export function Composer() {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId } = useHousehold();
  const { create } = usePostMutations();
  const [text, setText] = useState('');
  const [color, setColor] = useState<PostColor | 'none'>('none');
  const [expires, setExpires] = useState<Date | null>(null);
  const [attachments, setAttachments] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(0);

  const attach = async (pick: () => Promise<PickedFile | null>) => {
    let picked: PickedFile | null;
    try {
      picked = await pick();
    } catch (e) {
      showError(e, t);
      return;
    }
    if (!picked) return;
    setUploading((n) => n + 1);
    try {
      const file = await uploadAttachment(householdId, t('m.pinboard.folderName'), picked);
      setAttachments((a) => [...a, { id: file.id, name: file.name }]);
    } catch (e) {
      showError(e, t);
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    create.mutate(
      {
        text: v,
        color: color === 'none' ? null : color,
        expiresAt: expires ? expiryIso(expires) : null,
        attachmentFileIds: attachments.map((a) => a.id),
      },
      {
        onSuccess: () => {
          setText('');
          setColor('none');
          setExpires(null);
          setAttachments([]);
        },
      },
    );
  };

  const full = attachments.length + uploading >= MAX_ATTACHMENTS;

  return (
    <View className="gap-3 rounded-lg border border-border bg-surface p-4">
      <TextField
        label={t('m.pinboard.composerLabel')}
        placeholder={t('m.pinboard.composerPlaceholder')}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={2000}
      />
      <ChipSelect<PostColor | 'none'>
        label={t('m.pinboard.color')}
        scroll
        value={color}
        onChange={setColor}
        options={[
          { value: 'none', label: t('m.pinboard.noColor') },
          ...POST_COLORS.map((c) => ({
            value: c,
            label: t(`m.pinboard.colors.${c}`),
            color: POST_COLOR_HEX[c],
          })),
        ]}
      />
      <DateField
        label={t('m.pinboard.expiresAt')}
        value={expires}
        onChange={setExpires}
        clearable
        minimumDate={new Date()}
      />
      <View className="gap-2">
        <Text variant="label">{t('m.pinboard.attachments')}</Text>
        {attachments.map((a) => (
          <View
            key={a.id}
            className="flex-row items-center gap-2 rounded-md border border-border px-3"
          >
            <FileText size={16} color={colors.textMuted} />
            <Text className="flex-1" numberOfLines={1}>
              {a.name}
            </Text>
            <IconButton
              label={t('m.pinboard.removeAttachment', { name: a.name })}
              onPress={() => {
                setAttachments((list) => list.filter((x) => x.id !== a.id));
              }}
            >
              <X size={18} color={colors.textMuted} />
            </IconButton>
          </View>
        ))}
        {uploading > 0 ? (
          <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text variant="caption">{t('m.pinboard.uploading')}</Text>
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {Platform.OS !== 'web' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={full}
              icon={<Camera size={16} color={colors.text} />}
              title={t('m.pinboard.camera')}
              onPress={() => void attach(() => pickImage('camera'))}
            />
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            disabled={full}
            icon={<ImagePlus size={16} color={colors.text} />}
            title={t('m.pinboard.photo')}
            onPress={() => void attach(() => pickImage('library'))}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={full}
            icon={<FileText size={16} color={colors.text} />}
            title={t('m.pinboard.file')}
            onPress={() => void attach(pickDocument)}
          />
        </View>
      </View>
      <Button
        title={t('m.pinboard.post')}
        disabled={text.trim() === '' || uploading > 0}
        loading={create.isPending}
        onPress={submit}
      />
    </View>
  );
}

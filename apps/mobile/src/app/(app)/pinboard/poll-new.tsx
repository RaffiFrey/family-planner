import { router } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  DateField,
  IconButton,
  RowGroup,
  ScreenScroll,
  SwitchRow,
  Text,
  TextField,
} from '@/components/ui';
import { cleanPollOptions, usePollMutations } from '@/features/pinboard/hooks';
import { useColors } from '@/lib/theme';

export default function NewPollScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { create } = usePollMutations();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [closesAt, setClosesAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const q = question.trim();
    const cleaned = cleanPollOptions(options);
    if (!q) {
      setError(t('m.pinboard.needQuestion'));
      return;
    }
    if (cleaned.length < 2) {
      setError(t('m.pinboard.needTwoOptions'));
      return;
    }
    setError(null);
    create.mutate(
      {
        question: q,
        options: cleaned,
        multiple,
        anonymous,
        closesAt: closesAt ? closesAt.toISOString() : null,
      },
      {
        onSuccess: () => {
          router.back();
        },
      },
    );
  };

  return (
    <ScreenScroll>
      <TextField
        label={t('m.pinboard.question')}
        placeholder={t('m.pinboard.questionPlaceholder')}
        value={question}
        onChangeText={setQuestion}
        maxLength={300}
        autoFocus
      />
      {options.map((o, i) => (
        <View key={i} className="flex-row items-end gap-2">
          <TextField
            className="flex-1"
            label={t('m.pinboard.option', { n: i + 1 })}
            value={o}
            maxLength={120}
            onChangeText={(v) => {
              setOptions((prev) => prev.map((x, j) => (j === i ? v : x)));
            }}
          />
          {options.length > 2 ? (
            <IconButton
              label={t('m.pinboard.removeOption', { n: i + 1 })}
              onPress={() => {
                setOptions((prev) => prev.filter((_, j) => j !== i));
              }}
            >
              <X size={20} color={colors.textMuted} />
            </IconButton>
          ) : null}
        </View>
      ))}
      {options.length < 12 ? (
        <Button
          variant="ghost"
          icon={<Plus size={18} color={colors.primary} />}
          title={t('m.pinboard.addOption')}
          onPress={() => {
            setOptions((prev) => [...prev, '']);
          }}
        />
      ) : null}
      <RowGroup>
        <SwitchRow title={t('m.pinboard.multiple')} value={multiple} onValueChange={setMultiple} />
        <SwitchRow
          title={t('m.pinboard.anonymous')}
          value={anonymous}
          onValueChange={setAnonymous}
        />
      </RowGroup>
      <DateField
        label={t('m.pinboard.closesAt')}
        value={closesAt}
        onChange={setClosesAt}
        mode="datetime"
        clearable
        minimumDate={new Date()}
      />
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button title={t('m.pinboard.createPoll')} loading={create.isPending} onPress={submit} />
    </ScreenScroll>
  );
}

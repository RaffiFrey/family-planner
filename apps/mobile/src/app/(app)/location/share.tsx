import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import {
  Button,
  Card,
  ChipMultiSelect,
  ChipSelect,
  RowGroup,
  ScreenScroll,
  SwitchRow,
  Text,
} from '@/components/ui';
import { useHousehold, useMembers } from '@/features/household/household';
import { useStartSharing } from '@/features/location/hooks';
import { durationMinutes, SHARE_DURATIONS, type ShareDuration } from '@/features/location/share';
import { notify, showError } from '@/lib/dialogs';

type Audience = 'all' | 'some';

/** Explicit opt-in: how long, with whom, and whether to keep sharing in the background. */
export default function ShareLocationScreen() {
  const { t } = useTranslation();
  const { me } = useHousehold();
  const others = useMembers().filter((m) => m.id !== me.id && !m.isManaged);
  const start = useStartSharing();
  const [duration, setDuration] = useState<ShareDuration>('60');
  const [audience, setAudience] = useState<Audience>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [background, setBackground] = useState(false);
  const native = Platform.OS !== 'web';
  const invalid = audience === 'some' && selected.length === 0;

  const durationLabels: Record<ShareDuration, string> = {
    '60': t('m.location.duration60'),
    tonight: t('m.location.durationTonight'),
    '480': t('m.location.duration480'),
    '1440': t('m.location.duration1440'),
    '10080': t('m.location.duration10080'),
  };

  const submit = () => {
    start.mutate(
      {
        durationMinutes: durationMinutes(duration),
        sharedWith: audience === 'all' ? null : selected,
        background: native && background,
      },
      {
        onSuccess: (res) => {
          if (native && background && !res.background)
            notify(t('m.location.backgroundDeniedTitle'), t('m.location.backgroundDenied'));
          router.back();
        },
        onError: (e) => {
          showError(e, t);
        },
      },
    );
  };

  return (
    <ScreenScroll>
      <Text variant="heading">{t('m.location.shareTitle')}</Text>
      <Text>{t('m.location.consentText')}</Text>

      <ChipSelect
        label={t('m.location.duration')}
        options={SHARE_DURATIONS.map((d) => ({ value: d, label: durationLabels[d] }))}
        value={duration}
        onChange={setDuration}
      />

      <ChipSelect<Audience>
        label={t('m.location.audience')}
        options={[
          { value: 'all', label: t('m.location.audienceAllOption') },
          { value: 'some', label: t('m.location.audienceSomeOption') },
        ]}
        value={audience}
        onChange={setAudience}
      />
      {audience === 'some' ? (
        others.length === 0 ? (
          <Text variant="caption">{t('m.location.noOtherMembers')}</Text>
        ) : (
          <ChipMultiSelect
            options={others.map((m) => ({ value: m.id, label: m.displayName, color: m.color }))}
            value={selected}
            onChange={setSelected}
          />
        )
      ) : null}

      {native ? (
        <RowGroup>
          <SwitchRow
            title={t('m.location.backgroundTitle')}
            subtitle={t('m.location.backgroundHint')}
            value={background}
            onValueChange={setBackground}
          />
        </RowGroup>
      ) : (
        <Card>
          <Text variant="caption">{t('m.location.webForegroundOnly')}</Text>
        </Card>
      )}

      <View className="gap-1">
        <Text variant="caption">• {t('m.location.optInPoint2')}</Text>
        <Text variant="caption">• {t('m.location.optInPoint3')}</Text>
      </View>

      <Button
        title={t('m.location.startConfirm')}
        loading={start.isPending}
        disabled={invalid}
        onPress={submit}
      />
    </ScreenScroll>
  );
}

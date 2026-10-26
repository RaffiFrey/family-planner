import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function HomeAssetsLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('nav.homeAssets') }} />
      <Stack.Screen name="[assetId]" options={{ title: '' }} />
      <Stack.Screen
        name="asset-edit"
        options={{ title: t('m.homeAssets.addAsset'), ...modalPresentation }}
      />
      <Stack.Screen
        name="maintenance-new"
        options={{ title: t('m.homeAssets.addPlan'), ...modalPresentation }}
      />
      <Stack.Screen
        name="meter"
        options={{ title: t('m.homeAssets.addReading'), ...modalPresentation }}
      />
      <Stack.Screen
        name="maintenance-complete"
        options={{ title: t('m.homeAssets.completeTitle'), ...modalPresentation }}
      />
      <Stack.Screen
        name="maintenance-edit"
        options={{ title: t('m.homeAssets.editPlan'), ...modalPresentation }}
      />
      <Stack.Screen name="consumption" options={{ title: t('m.homeAssets.consumption') }} />
    </Stack>
  );
}

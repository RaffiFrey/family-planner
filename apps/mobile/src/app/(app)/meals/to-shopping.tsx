import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChipSelect, RowGroup, ScreenScroll, SwitchRow, Text } from '@/components/ui';
import { useLists } from '@/features/lists/hooks';
import { useMealMutations } from '@/features/meals/hooks';
import { parseLocalDate } from '@/features/meals/utils';
import { useIntlLocale } from '@/i18n';
import { notify } from '@/lib/dialogs';

const DEFAULT_LIST = 'default';

/** Add the ingredients of the planned meals (from..to) to a chosen shopping list. */
export default function ToShoppingScreen() {
  const { from, to } = useLocalSearchParams<{ from: string; to: string }>();
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const lists = useLists();
  const { toShoppingList } = useMealMutations();
  const shoppingLists = (lists.data ?? []).filter((l) => l.kind === 'shopping');
  const [listId, setListId] = useState<string>(DEFAULT_LIST);
  const [skipStaples, setSkipStaples] = useState(true);
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
  // Without a choice the first shopping list is used; preselect it so the target is visible.
  const selected = listId === DEFAULT_LIST ? (shoppingLists[0]?.id ?? DEFAULT_LIST) : listId;

  const submit = () => {
    toShoppingList.mutate(
      { from, to, skipStaples, ...(selected === DEFAULT_LIST ? {} : { listId: selected }) },
      {
        onSuccess: (result) => {
          notify(t('m.meals.toShoppingDone', { count: result.items.length }));
          router.dismiss();
          router.push({ pathname: '/lists/[listId]', params: { listId: result.listId } });
        },
      },
    );
  };

  return (
    <ScreenScroll>
      <Text variant="heading">{t('m.meals.toShoppingTitle')}</Text>
      <Text variant="caption">
        {fmt.format(parseLocalDate(from))} – {fmt.format(parseLocalDate(to))}
      </Text>
      {shoppingLists.length > 0 ? (
        <ChipSelect
          label={t('m.meals.targetList')}
          value={selected}
          onChange={setListId}
          options={shoppingLists.map((l) => ({ value: l.id, label: l.name }))}
        />
      ) : (
        <Text variant="caption">{t('m.meals.noShoppingList')}</Text>
      )}
      <RowGroup>
        <SwitchRow
          title={t('m.meals.skipStaples')}
          subtitle={t('m.meals.toShoppingMessage')}
          value={skipStaples}
          onValueChange={setSkipStaples}
        />
      </RowGroup>
      <Button title={t('m.meals.toShopping')} loading={toShoppingList.isPending} onPress={submit} />
    </ScreenScroll>
  );
}

import type { ListItem } from '@fp/contracts';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Check, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, TextInput, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Chip, EmptyState, ErrorState, IconButton, LoadingView, Text } from '@/components/ui';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { groupListItems, type ItemCategory } from '@/features/lists/grouping';
import { useList, useListMutations, useSuggestions } from '@/features/lists/hooks';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { useDebounced } from '@/lib/use-debounced';

/** Realtime list: quick add with suggestions, aisle grouping, tap to check, swipe to delete. */
export default function ListDetailScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  const members = useMemberMap();
  const list = useList(listId);
  const { toggle, add, remove, clearChecked } = useListMutations(listId);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const query = useDebounced(text.trim(), 250);
  const suggestions = useSuggestions(query);
  const writable = can('lists.write');

  const submit = (value: string, category?: ItemCategory) => {
    const v = value.trim();
    if (!v) return;
    add.mutate(category ? { text: v, category } : { text: v });
    setText('');
  };

  if (list.isPending) return <LoadingView />;
  if (list.error && !list.data)
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  const sections = groupListItems(list.data.items).map((s) => ({
    key: s.key,
    title: s.key === 'checked' ? t('m.lists.checked') : t(`itemCategories.${s.key}`),
    data: s.items,
  }));
  const hasChecked = list.data.items.some((i) => i.checked);
  const existing = new Set(
    list.data.items.filter((i) => !i.checked).map((i) => i.text.toLowerCase()),
  );
  const suggestionChips = (suggestions.data ?? [])
    .filter((s) => !existing.has(s.text.toLowerCase()))
    .slice(0, 12);

  const renderItem = ({ item }: { item: ListItem }) => {
    const checkedBy = item.checkedByMemberId ? members.get(item.checkedByMemberId) : undefined;
    const pending = item.id.startsWith('tmp-');
    return (
      <Animated.View entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
        <Swipeable
          enabled={writable && !pending}
          friction={2}
          rightThreshold={60}
          renderRightActions={() => (
            <View className="w-20 items-center justify-center bg-danger">
              <Trash2 size={22} color="#ffffff" />
            </View>
          )}
          onSwipeableOpen={() => {
            remove.mutate(item);
          }}
        >
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked, disabled: pending }}
            accessibilityLabel={item.quantity ? `${item.quantity} ${item.text}` : item.text}
            accessibilityHint={writable ? t('m.lists.swipeHint') : undefined}
            disabled={pending || !writable}
            onPress={() => {
              toggle.mutate(item);
            }}
            accessibilityActions={
              writable && !pending ? [{ name: 'delete', label: t('common.delete') }] : []
            }
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'delete') remove.mutate(item);
            }}
            className="min-h-14 flex-row items-center gap-3 bg-background px-4 py-3"
          >
            <View
              className={`h-6 w-6 items-center justify-center rounded-full border-2 ${item.checked ? 'border-success bg-success' : 'border-border'}`}
            >
              {item.checked ? <Check size={14} color="#ffffff" /> : null}
            </View>
            <View className="flex-1">
              <Text
                className={item.checked ? 'text-muted line-through' : pending ? 'text-muted' : ''}
              >
                {item.quantity ? `${item.quantity} ` : ''}
                {item.text}
              </Text>
              {item.checked && checkedBy ? (
                <Text variant="caption">{checkedBy.displayName}</Text>
              ) : null}
            </View>
          </Pressable>
        </Swipeable>
      </Animated.View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: list.data.name,
          headerRight: () =>
            hasChecked && writable ? (
              <IconButton
                label={t('m.lists.clearChecked')}
                onPress={() => {
                  void confirmAsync(t('m.lists.clearChecked'), undefined, {
                    confirmLabel: t('common.delete'),
                    cancelLabel: t('common.cancel'),
                    destructive: true,
                  }).then((ok) => {
                    if (ok) clearChecked.mutate();
                  });
                }}
              >
                <Trash2 size={20} color={colors.text} />
              </IconButton>
            ) : null,
        }}
      />
      {writable ? (
        <View className="gap-2 border-b border-border p-3">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => {
                setFocused(true);
              }}
              onBlur={() => {
                setFocused(false);
              }}
              onSubmitEditing={() => {
                submit(text);
              }}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder={t('m.lists.addPlaceholder')}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={t('m.lists.addPlaceholder')}
              maxFontSizeMultiplier={2}
              className="min-h-12 flex-1 rounded-md border border-border bg-surface px-3 text-base text-text"
            />
            <IconButton
              label={t('common.add')}
              onPress={() => {
                submit(text);
              }}
              className="bg-primary"
            >
              <Plus size={22} color={colors.primaryText} />
            </IconButton>
          </View>
          {(focused || text.length > 0) && suggestionChips.length > 0 ? (
            <View
              className="flex-row flex-wrap gap-2"
              accessibilityLabel={t('m.lists.suggestions')}
            >
              {suggestionChips.map((s) => (
                <Chip
                  key={s.text}
                  label={s.text}
                  selected={false}
                  onPress={() => {
                    submit(s.text, s.category);
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View className="bg-surface-muted px-4 py-1.5">
            <Text variant="caption" className="font-semibold uppercase" accessibilityRole="header">
              {section.title} ({section.data.length})
            </Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View className="ml-14 h-px bg-border" />}
        ListEmptyComponent={<EmptyState title={t('m.lists.noItems')} />}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-24"
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
        stickySectionHeadersEnabled
      />
    </View>
  );
}

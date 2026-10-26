import type { Member, Poll } from '@fp/contracts';
import { Check, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button, IconButton, ProgressBar, Text } from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { isAdultRole, optionPercent, usePollMutations } from './hooks';

export function PollCard({ poll, author }: { poll: Poll; author: Member | undefined }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { me, can } = useHousehold();
  const { vote, unvote, close, remove } = usePollMutations();
  const writable = can('pinboard.write');
  const canManage = writable && (poll.authorMemberId === me.id || isAdultRole(me.role));
  const [selected, setSelected] = useState<number[]>(poll.myVotes);
  const voted = poll.myVotes.length > 0;
  const canVote = writable && poll.open;
  const totalVotes = poll.options.reduce((s, o) => s + o.votes, 0);
  const showResults = voted || !poll.open;

  const toggle = (index: number) => {
    if (!canVote) return;
    if (poll.multiple) {
      setSelected((s) => (s.includes(index) ? s.filter((i) => i !== index) : [...s, index]));
    } else {
      setSelected([index]);
      if (!voted || poll.myVotes[0] !== index) vote.mutate({ poll, optionIndexes: [index] });
    }
  };

  return (
    <View className="gap-3 rounded-lg border border-border bg-surface p-4" testID="pinboard-poll">
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-0.5">
          <Text variant="subheading">{poll.question}</Text>
          <Text variant="caption">
            {[
              author?.displayName,
              poll.open ? t('m.pinboard.open') : t('m.pinboard.closed'),
              t('m.pinboard.voters', { count: poll.totalVoters }),
              poll.multiple ? t('m.pinboard.chooseOptions') : null,
              poll.anonymous ? t('m.pinboard.anonymousHint') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {canManage ? (
          <IconButton
            label={t('common.delete')}
            onPress={() => {
              void confirmAsync(t('m.pinboard.deletePoll'), poll.question, {
                confirmLabel: t('common.delete'),
                cancelLabel: t('common.cancel'),
                destructive: true,
              }).then((ok) => {
                if (ok) remove.mutate(poll);
              });
            }}
          >
            <Trash2 size={18} color={colors.textMuted} />
          </IconButton>
        ) : null}
      </View>
      <View
        className="gap-2"
        accessibilityRole={poll.multiple ? undefined : 'radiogroup'}
        accessibilityLabel={poll.question}
      >
        {poll.options.map((o) => {
          const isSelected = selected.includes(o.index);
          const percent = optionPercent(o.votes, totalVotes);
          return (
            <Pressable
              key={o.index}
              disabled={!canVote || vote.isPending}
              accessibilityRole={poll.multiple ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: isSelected, disabled: !canVote }}
              accessibilityLabel={
                showResults
                  ? t('m.pinboard.optionVotes', { option: o.text, votes: o.votes, percent })
                  : o.text
              }
              onPress={() => {
                toggle(o.index);
              }}
              className={`min-h-12 gap-1.5 rounded-md border px-3 py-2 ${isSelected ? 'border-primary' : 'border-border'}`}
            >
              <View className="flex-row items-center gap-2">
                <View
                  className={`h-5 w-5 items-center justify-center border-2 ${poll.multiple ? 'rounded' : 'rounded-full'} ${isSelected ? 'border-primary bg-primary' : 'border-border'}`}
                >
                  {isSelected ? <Check size={12} color={colors.primaryText} /> : null}
                </View>
                <Text className="flex-1">{o.text}</Text>
                {showResults ? <Text variant="caption">{percent} %</Text> : null}
              </View>
              {showResults ? <ProgressBar ratio={percent / 100} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {canVote && poll.multiple ? (
          <Button
            size="sm"
            title={t('m.pinboard.vote')}
            disabled={selected.length === 0}
            loading={vote.isPending}
            onPress={() => {
              vote.mutate({ poll, optionIndexes: [...selected].sort((a, b) => a - b) });
            }}
          />
        ) : null}
        {canVote && voted ? (
          <Button
            size="sm"
            variant="secondary"
            title={t('m.pinboard.withdrawVote')}
            onPress={() => {
              setSelected([]);
              unvote.mutate(poll);
            }}
          />
        ) : null}
        {canManage && poll.open ? (
          <Button
            size="sm"
            variant="ghost"
            title={t('m.pinboard.closePoll')}
            onPress={() => {
              close.mutate(poll);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

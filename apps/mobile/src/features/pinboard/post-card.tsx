import type { Member, Post } from '@fp/contracts';
import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Avatar, Button, IconButton, Text, TextField } from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { PostAttachments } from './attachments';
import { isAdultRole, POST_COLOR_HEX, QUICK_EMOJIS, usePostMutations } from './hooks';

export function PostCard({ post, author }: { post: Post; author: Member | undefined }) {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { me, can } = useHousehold();
  const { update, remove, toggleReaction } = usePostMutations();
  const writable = can('pinboard.write');
  const adult = isAdultRole(me.role);
  const canManage = writable && (post.authorMemberId === me.id || adult);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text);
  const accent = post.color ? POST_COLOR_HEX[post.color] : colors.border;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(post.createdAt),
  );
  // Quick emojis first, then any other emoji someone used.
  const emojis = [
    ...QUICK_EMOJIS,
    ...post.reactions
      .map((r) => r.emoji)
      .filter((e) => !(QUICK_EMOJIS as readonly string[]).includes(e)),
  ];

  return (
    <View
      className="gap-3 rounded-lg border border-border bg-surface p-4"
      style={{ borderLeftWidth: 6, borderLeftColor: accent }}
      testID="pinboard-post"
    >
      <View className="flex-row items-center gap-3">
        <Avatar
          name={author?.displayName ?? '?'}
          color={author?.color ?? colors.textMuted}
          size={32}
        />
        <View className="flex-1">
          <Text className="font-semibold">{author?.displayName ?? ''}</Text>
          <Text variant="caption">{when}</Text>
        </View>
        {post.pinned ? (
          <View className="flex-row items-center gap-1" accessibilityLabel={t('m.pinboard.pinned')}>
            <Pin size={14} color={colors.primary} />
            <Text variant="caption" className="text-primary">
              {t('m.pinboard.pinned')}
            </Text>
          </View>
        ) : null}
      </View>
      {editing ? (
        <View className="gap-2">
          <TextField
            label={t('m.pinboard.editPost')}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            autoFocus
          />
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              size="sm"
              variant="secondary"
              title={t('common.cancel')}
              onPress={() => {
                setDraft(post.text);
                setEditing(false);
              }}
            />
            <Button
              className="flex-1"
              size="sm"
              title={t('common.save')}
              disabled={draft.trim() === ''}
              loading={update.isPending}
              onPress={() => {
                update.mutate(
                  { post, body: { text: draft.trim() } },
                  {
                    onSuccess: () => {
                      setEditing(false);
                    },
                  },
                );
              }}
            />
          </View>
        </View>
      ) : (
        <Text selectable>{post.text}</Text>
      )}
      <PostAttachments fileIds={post.attachmentFileIds} />
      {post.expiresAt ? (
        <Text variant="caption">
          {t('m.pinboard.expires', {
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(post.expiresAt),
            ),
          })}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-2">
        {emojis.map((emoji) => {
          const r = post.reactions.find((x) => x.emoji === emoji);
          const count = r?.count ?? 0;
          const mine = r?.mine ?? false;
          return (
            <Pressable
              key={emoji}
              disabled={!writable || toggleReaction.isPending}
              accessibilityRole="button"
              accessibilityState={{ selected: mine }}
              accessibilityLabel={
                mine
                  ? t('m.pinboard.removeReaction', { emoji })
                  : count > 0
                    ? `${t('m.pinboard.react', { emoji })}, ${t('m.pinboard.reactionCount', { emoji, count })}`
                    : t('m.pinboard.react', { emoji })
              }
              onPress={() => {
                toggleReaction.mutate({ post, emoji });
              }}
              className={`min-h-9 flex-row items-center gap-1 rounded-full border px-2.5 ${mine ? 'border-primary bg-surface-muted' : 'border-border'}`}
            >
              <Text>{emoji}</Text>
              {count > 0 ? <Text variant="caption">{count}</Text> : null}
            </Pressable>
          );
        })}
        <View className="flex-1" />
        {canManage && adult ? (
          <IconButton
            label={post.pinned ? t('m.pinboard.unpin') : t('m.pinboard.pin')}
            onPress={() => {
              update.mutate({ post, body: { pinned: !post.pinned } });
            }}
          >
            {post.pinned ? (
              <PinOff size={18} color={colors.textMuted} />
            ) : (
              <Pin size={18} color={colors.textMuted} />
            )}
          </IconButton>
        ) : null}
        {canManage && !editing ? (
          <IconButton
            label={t('m.pinboard.editPost')}
            onPress={() => {
              setDraft(post.text);
              setEditing(true);
            }}
          >
            <Pencil size={18} color={colors.textMuted} />
          </IconButton>
        ) : null}
        {canManage ? (
          <IconButton
            label={t('common.delete')}
            onPress={() => {
              void confirmAsync(t('m.pinboard.deletePost'), post.text.slice(0, 80), {
                confirmLabel: t('common.delete'),
                cancelLabel: t('common.cancel'),
                destructive: true,
              }).then((ok) => {
                if (ok) remove.mutate(post);
              });
            }}
          >
            <Trash2 size={18} color={colors.textMuted} />
          </IconButton>
        ) : null}
      </View>
    </View>
  );
}

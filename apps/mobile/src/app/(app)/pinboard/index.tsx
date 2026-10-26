import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { ModuleGate } from '@/components/gates';
import { Button, EmptyState, ErrorState, Fab, LoadingView, Segmented } from '@/components/ui';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { Composer } from '@/features/pinboard/composer';
import { useFeed, usePolls } from '@/features/pinboard/hooks';
import { PollCard } from '@/features/pinboard/poll-card';
import { PostCard } from '@/features/pinboard/post-card';

type Tab = 'posts' | 'polls';

export default function PinboardScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('posts');
  return (
    <ModuleGate action="pinboard.read">
      <View className="flex-1 bg-background">
        <View className="px-4 pt-3">
          <Segmented<Tab>
            label={t('m.pinboard.title')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'posts', label: t('m.pinboard.posts') },
              { value: 'polls', label: t('m.pinboard.polls') },
            ]}
          />
        </View>
        {tab === 'posts' ? <PostsTab /> : <PollsTab />}
      </View>
    </ModuleGate>
  );
}

function PostsTab() {
  const { t } = useTranslation();
  const { can } = useHousehold();
  const members = useMemberMap();
  const feed = useFeed();
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <ScrollView
      contentContainerClassName="gap-3 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />
      }
    >
      {can('pinboard.write') ? <Composer /> : null}
      {feed.isPending ? (
        <LoadingView />
      ) : feed.error && !feed.data ? (
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      ) : posts.length === 0 ? (
        <EmptyState title={t('m.pinboard.empty')} message={t('m.pinboard.emptyHint')} />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} author={members.get(p.authorMemberId)} />)
      )}
      {feed.hasNextPage ? (
        <Button
          variant="secondary"
          title={t('m.pinboard.loadMore')}
          loading={feed.isFetchingNextPage}
          onPress={() => void feed.fetchNextPage()}
        />
      ) : null}
    </ScrollView>
  );
}

function PollsTab() {
  const { t } = useTranslation();
  const { can } = useHousehold();
  const members = useMemberMap();
  const polls = usePolls();
  return (
    <View className="flex-1">
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-28"
        refreshControl={
          <RefreshControl refreshing={polls.isRefetching} onRefresh={() => void polls.refetch()} />
        }
      >
        {polls.isPending ? (
          <LoadingView />
        ) : polls.error && !polls.data ? (
          <ErrorState error={polls.error} onRetry={() => void polls.refetch()} />
        ) : polls.data.length === 0 ? (
          <EmptyState title={t('m.pinboard.noPolls')} message={t('m.pinboard.noPollsHint')} />
        ) : (
          polls.data.map((p) => (
            <PollCard
              key={`${p.id}:${p.myVotes.join(',')}`}
              poll={p}
              author={members.get(p.authorMemberId)}
            />
          ))
        )}
      </ScrollView>
      {can('pinboard.write') ? (
        <Fab
          label={t('m.pinboard.newPoll')}
          onPress={() => {
            router.push('/pinboard/poll-new');
          }}
        />
      ) : null}
    </View>
  );
}

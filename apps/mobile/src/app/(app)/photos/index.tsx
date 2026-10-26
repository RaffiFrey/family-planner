import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  Card,
  EmptyState,
  ErrorState,
  Fab,
  LoadingView,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { useAlbums, useMemories } from '@/features/photos/hooks';
import { PhotoThumb } from '@/features/photos/photo-thumb';

/** "An diesem Tag" memories and the album grid. */
export default function PhotosScreen() {
  const { t } = useTranslation();
  const { can } = useHousehold();
  const albums = useAlbums();
  const memories = useMemories();
  const refresh = () => {
    void albums.refetch();
    void memories.refetch();
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        refreshControl={<RefreshControl refreshing={albums.isRefetching} onRefresh={refresh} />}
      >
        <SectionHeader title={t('m.photos.onThisDay')} />
        {memories.data && memories.data.length > 0 ? (
          memories.data.map((m) => (
            <Card key={m.year}>
              <Text variant="label">
                {t('m.photos.yearsAgo', { count: m.yearsAgo, year: m.year })}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {m.items.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.caption ?? item.fileName}
                    onPress={() => {
                      router.push({
                        pathname: '/photos/[albumId]',
                        params: { albumId: item.albumId },
                      });
                    }}
                  >
                    <PhotoThumb
                      fileId={item.fileId}
                      mimeType={item.mimeType}
                      alt={item.caption ?? item.fileName}
                      size={96}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </Card>
          ))
        ) : (
          <Card>
            <Text variant="caption">{t('m.photos.noMemories')}</Text>
          </Card>
        )}

        <SectionHeader title={t('m.photos.albums')} />
        {albums.isPending ? (
          <LoadingView />
        ) : albums.error && !albums.data ? (
          <ErrorState error={albums.error} onRetry={() => void albums.refetch()} />
        ) : albums.data.length === 0 ? (
          <EmptyState title={t('m.photos.empty')} message={t('m.photos.emptyHint')} />
        ) : (
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
            {albums.data.map((album) => (
              <View key={album.id} className="w-1/2 p-1.5">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${album.title}, ${t('m.photos.itemCount', { count: album.itemCount })}`}
                  onPress={() => {
                    router.push({ pathname: '/photos/[albumId]', params: { albumId: album.id } });
                  }}
                  className="gap-1 active:opacity-80"
                >
                  <PhotoThumb fileId={album.coverFileId} alt={album.title} />
                  <Text className="font-semibold" numberOfLines={1}>
                    {album.title}
                  </Text>
                  <Text variant="caption">
                    {t('m.photos.itemCount', { count: album.itemCount })}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      {can('photos.write') ? (
        <Fab
          label={t('m.photos.newAlbum')}
          onPress={() => {
            router.push('/photos/new');
          }}
        />
      ) : null}
    </View>
  );
}

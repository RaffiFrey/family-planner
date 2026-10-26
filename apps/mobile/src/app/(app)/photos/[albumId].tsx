import type { AlbumItem } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, Camera, ImagePlus, Pencil, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SwitchRow,
  Text,
  TextField,
} from '@/components/ui';
import { pickImage } from '@/features/files/file-transfer';
import { useHousehold } from '@/features/household/household';
import { useAlbum } from '@/features/photos/hooks';
import { moveItem } from '@/features/photos/order';
import { PhotoThumb } from '@/features/photos/photo-thumb';
import { uploadAndWait } from '@/features/photos/upload';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync, notify, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

/** Album grid; add photos from the camera or library, tap to view, remove from album. */
export default function AlbumScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const album = useAlbum(albumId);
  const writable = can('photos.write') && can('storage.write');
  const [viewing, setViewing] = useState<AlbumItem | null>(null);
  const [reordering, setReordering] = useState(false);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['photos'] }),
      queryClient.invalidateQueries({ queryKey: ['storage'] }),
    ]);

  const add = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      const picked = await pickImage(source);
      if (!picked) return false;
      const file = await uploadAndWait(householdId, t('m.photos.folder'), picked);
      if (!file) {
        notify(t('m.photos.processing'));
        return false;
      }
      await api.photos.addItems({
        params: { householdId, albumId },
        body: { items: [{ fileId: file.id }] },
      });
      return true;
    },
    onError: (e) => {
      showError(e, t);
    },
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (itemId: string) =>
      api.photos.removeItem({ params: { householdId, albumId, itemId } }),
    onSuccess: () => {
      setViewing(null);
    },
    onError: (e) => {
      showError(e, t);
    },
    onSettled: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (itemIds: string[]) =>
      api.photos.reorder({ params: { householdId, albumId }, body: { itemIds } }),
    onError: (e) => {
      showError(e, t);
    },
    onSettled: invalidate,
  });
  const caption = useMutation({
    mutationFn: (v: { itemId: string; caption: string }) =>
      api.photos.updateItem({
        params: { householdId, albumId, itemId: v.itemId },
        body: { caption: v.caption.trim() === '' ? null : v.caption.trim() },
      }),
    onSuccess: (item) => {
      setViewing(item);
    },
    onError: (e) => {
      showError(e, t);
    },
    onSettled: invalidate,
  });
  const removeAlbum = useMutation({
    mutationFn: () => api.photos.remove({ params: { householdId, albumId } }),
    onSuccess: () => {
      router.back();
    },
    onError: (e) => {
      showError(e, t);
    },
    onSettled: invalidate,
  });

  if (album.isPending) return <LoadingView />;
  if (album.error && !album.data)
    return <ErrorState error={album.error} onRetry={() => void album.refetch()} />;
  const data = album.data;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: data.title,
          headerRight: () =>
            can('photos.write') ? (
              <View className="flex-row">
                <IconButton
                  label={t('m.photos.editAlbum')}
                  onPress={() => {
                    router.push({ pathname: '/photos/new', params: { albumId } });
                  }}
                >
                  <Pencil size={20} color={colors.text} />
                </IconButton>
                <IconButton
                  label={t('m.photos.deleteAlbum')}
                  onPress={() => {
                    void confirmAsync(t('m.photos.deleteAlbum'), t('m.photos.deleteAlbumHint'), {
                      confirmLabel: t('common.delete'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    }).then((ok) => {
                      if (ok) removeAlbum.mutate();
                    });
                  }}
                >
                  <Trash2 size={20} color={colors.text} />
                </IconButton>
              </View>
            ) : null,
        }}
      />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-12"
        refreshControl={
          <RefreshControl refreshing={album.isRefetching} onRefresh={() => void album.refetch()} />
        }
      >
        {data.description ? <Text variant="caption">{data.description}</Text> : null}
        {writable ? (
          <View className="flex-row gap-2">
            {Platform.OS !== 'web' ? (
              <Button
                className="flex-1"
                variant="secondary"
                title={t('m.files.camera')}
                icon={<Camera size={18} color={colors.text} />}
                disabled={add.isPending}
                onPress={() => {
                  add.mutate('camera');
                }}
              />
            ) : null}
            <Button
              className="flex-1"
              variant="secondary"
              title={add.isPending ? t('m.files.uploading') : t('m.photos.addPhoto')}
              icon={<ImagePlus size={18} color={colors.text} />}
              loading={add.isPending}
              onPress={() => {
                add.mutate('library');
              }}
            />
          </View>
        ) : null}
        {can('photos.write') && data.items.length > 1 ? (
          <RowGroup>
            <SwitchRow
              title={t('m.photos.reorder')}
              value={reordering}
              onValueChange={setReordering}
            />
          </RowGroup>
        ) : null}
        {data.items.length === 0 ? (
          <EmptyState title={t('m.photos.albumEmpty')} />
        ) : reordering ? (
          <RowGroup>
            {data.items.map((item, i) => {
              const label = item.caption ?? item.fileName;
              const ids = data.items.map((x) => x.id);
              const last = i === data.items.length - 1;
              return (
                <View key={item.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={label}
                    subtitle={t('m.photos.position', { position: i + 1, total: ids.length })}
                    left={
                      <PhotoThumb
                        fileId={item.fileId}
                        mimeType={item.mimeType}
                        alt={label}
                        size={48}
                      />
                    }
                    right={
                      <View className="flex-row">
                        <IconButton
                          label={t('m.photos.moveUp', { name: label })}
                          disabled={i === 0 || reorder.isPending}
                          onPress={() => {
                            reorder.mutate(moveItem(ids, i, i - 1));
                          }}
                        >
                          <ArrowUp size={20} color={i === 0 ? colors.border : colors.text} />
                        </IconButton>
                        <IconButton
                          label={t('m.photos.moveDown', { name: label })}
                          disabled={last || reorder.isPending}
                          onPress={() => {
                            reorder.mutate(moveItem(ids, i, i + 1));
                          }}
                        >
                          <ArrowDown size={20} color={last ? colors.border : colors.text} />
                        </IconButton>
                      </View>
                    }
                  />
                </View>
              );
            })}
          </RowGroup>
        ) : (
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
            {data.items.map((item) => (
              <Pressable
                key={item.id}
                className="w-1/3 p-0.5"
                accessibilityRole="button"
                accessibilityLabel={item.caption ?? item.fileName}
                onPress={() => {
                  setViewing(item);
                }}
              >
                <PhotoThumb
                  fileId={item.fileId}
                  mimeType={item.mimeType}
                  alt={item.caption ?? item.fileName}
                />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={viewing !== null}
        animationType="fade"
        onRequestClose={() => {
          setViewing(null);
        }}
      >
        {viewing ? (
          <View className="flex-1 bg-black" accessibilityViewIsModal>
            <View className="flex-row items-center justify-between p-4 pt-12">
              <IconButton
                label={t('common.close')}
                onPress={() => {
                  setViewing(null);
                }}
              >
                <X size={24} color="#ffffff" />
              </IconButton>
              {can('photos.write') ? (
                <IconButton
                  label={t('m.photos.removeFromAlbum')}
                  onPress={() => {
                    void confirmAsync(t('m.photos.removeFromAlbum'), t('m.photos.removeHint'), {
                      confirmLabel: t('common.delete'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    }).then((ok) => {
                      if (ok) remove.mutate(viewing.id);
                    });
                  }}
                >
                  <Trash2 size={22} color="#ffffff" />
                </IconButton>
              ) : null}
            </View>
            <View className="flex-1 justify-center">
              <PhotoThumb
                fileId={viewing.fileId}
                mimeType={viewing.mimeType}
                alt={viewing.caption ?? viewing.fileName}
                variant="full"
              />
            </View>
            <View className="gap-1 p-4 pb-10">
              {can('photos.write') ? (
                <CaptionEditor
                  key={viewing.id}
                  initial={viewing.caption ?? ''}
                  saving={caption.isPending}
                  onSave={(text) => {
                    caption.mutate({ itemId: viewing.id, caption: text });
                  }}
                />
              ) : viewing.caption ? (
                <Text className="text-white">{viewing.caption}</Text>
              ) : null}
              <Text className="text-sm text-white/70">
                {dateFmt.format(new Date(viewing.takenAt ?? viewing.createdAt))}
              </Text>
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

/** Caption field inside the dark photo viewer. */
function CaptionEditor({
  initial,
  saving,
  onSave,
}: {
  initial: string;
  saving: boolean;
  onSave: (caption: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  return (
    <View className="flex-row items-end gap-2">
      <View className="flex-1">
        <TextField
          label={t('m.photos.caption')}
          value={text}
          onChangeText={setText}
          placeholder={t('m.photos.captionPlaceholder')}
          maxLength={500}
        />
      </View>
      <Button
        size="sm"
        title={t('common.save')}
        loading={saving}
        disabled={text.trim() === initial.trim()}
        onPress={() => {
          onSave(text);
        }}
      />
    </View>
  );
}

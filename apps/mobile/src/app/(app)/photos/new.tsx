import type { Album } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ChipSelect,
  ErrorState,
  LoadingView,
  ScreenScroll,
  TextField,
} from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { useAlbum } from '@/features/photos/hooks';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';

/** Create an album, or edit one with `?albumId=`. */
export default function AlbumFormScreen() {
  const { albumId } = useLocalSearchParams<{ albumId?: string }>();
  return albumId ? <EditAlbum albumId={albumId} /> : <AlbumForm album={undefined} />;
}

function EditAlbum({ albumId }: { albumId: string }) {
  const { t } = useTranslation();
  const album = useAlbum(albumId);
  if (album.isPending) return <LoadingView />;
  if (!album.data) return <ErrorState error={album.error} onRetry={() => void album.refetch()} />;
  return (
    <>
      <Stack.Screen options={{ title: t('m.photos.editAlbum') }} />
      <AlbumForm album={album.data} />
    </>
  );
}

function AlbumForm({ album }: { album: Album | undefined }) {
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(album?.title ?? '');
  const [description, setDescription] = useState(album?.description ?? '');
  const [visibility, setVisibility] = useState<'household' | 'private'>(
    album?.visibility === 'private' ? 'private' : 'household',
  );
  const [error, setError] = useState<string | undefined>();

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        description: description.trim() === '' ? null : description.trim(),
        visibility,
      };
      return album
        ? api.photos.update({ params: { householdId, albumId: album.id }, body })
        : api.photos.create({ params: { householdId }, body });
    },
    onSuccess: (saved) => {
      if (album) router.back();
      else router.replace({ pathname: '/photos/[albumId]', params: { albumId: saved.id } });
    },
    onError: (e) => {
      showError(e, t);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['photos'] }),
  });

  return (
    <ScreenScroll>
      <TextField
        label={t('m.photos.albumTitle')}
        value={title}
        onChangeText={setTitle}
        placeholder={t('m.photos.albumTitlePlaceholder')}
        error={error}
        autoFocus={!album}
      />
      <TextField
        label={t('m.calendar.description')}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <ChipSelect
        label={t('m.common.visibility')}
        value={visibility}
        onChange={setVisibility}
        options={[
          { value: 'household', label: t('visibility.household') },
          { value: 'private', label: t('visibility.private') },
        ]}
      />
      <Button
        title={t('common.save')}
        loading={save.isPending}
        onPress={() => {
          if (title.trim() === '') {
            setError(t('m.photos.titleRequired'));
            return;
          }
          save.mutate();
        }}
      />
    </ScreenScroll>
  );
}

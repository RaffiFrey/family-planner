import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ErrorState,
  LoadingView,
  RowGroup,
  ScreenScroll,
  SwitchRow,
  TextField,
} from '@/components/ui';
import { useFinancePlusMutation, useParties } from '@/features/finance-plus/hooks';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';

/** Rename, archive or delete an external person (members are managed via the household). */
export default function PartyScreen() {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const parties = useParties();
  if (parties.isPending) return <LoadingView />;
  const party = parties.data?.find((p) => p.id === partyId);
  if (!party) return <ErrorState error={parties.error ?? new Error('not found')} />;
  return <PartyForm id={party.id} name={party.name} archived={party.archived} />;
}

function PartyForm({
  id,
  name: initialName,
  archived: initialArchived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [archived, setArchived] = useState(initialArchived);
  const [error, setError] = useState<string | undefined>();
  const close = () => {
    router.back();
  };
  const update = useFinancePlusMutation(
    (householdId, body: { name: string; archived: boolean }) =>
      api.financePlus.updateParty({ params: { householdId, partyId: id }, body }),
    close,
  );
  const remove = useFinancePlusMutation(
    (householdId, _v: undefined) =>
      api.financePlus.deleteParty({ params: { householdId, partyId: id } }),
    close,
  );

  return (
    <ScreenScroll>
      <TextField label={t('common.name')} value={name} onChangeText={setName} error={error} />
      <RowGroup>
        <SwitchRow
          title={t('m.financePlus.archivePerson')}
          subtitle={t('m.financePlus.archivePersonHint')}
          value={archived}
          onValueChange={setArchived}
        />
      </RowGroup>
      <Button
        title={t('common.save')}
        loading={update.isPending}
        onPress={() => {
          if (name.trim() === '') {
            setError(t('m.financePlus.nameRequired'));
            return;
          }
          update.mutate({ name: name.trim(), archived });
        }}
      />
      <Button
        title={t('m.financePlus.deletePerson')}
        variant="ghost"
        loading={remove.isPending}
        onPress={() => {
          void confirmAsync(t('m.financePlus.deletePerson'), t('m.financePlus.deletePersonHint'), {
            confirmLabel: t('common.delete'),
            cancelLabel: t('common.cancel'),
            destructive: true,
          }).then((ok) => {
            if (ok) remove.mutate(undefined);
          });
        }}
      />
    </ScreenScroll>
  );
}

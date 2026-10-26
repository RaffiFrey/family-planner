'use client';

import { ApiError } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { ModuleGate } from '@/components/upsell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { AssetDialog } from './asset-dialog';
import { KIND_ICON, WarrantyBadge } from './home-assets-page';
import { MaintenanceList } from './maintenance';
import { MetersSection } from './meters';

export function AssetDetail({ assetId }: { assetId: string }) {
  return (
    <ModuleGate action="home.read">
      <AssetDetailInner assetId={assetId} />
    </ModuleGate>
  );
}

function AssetDetailInner({ assetId }: { assetId: string }) {
  const t = useTranslations('homeAssets');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const router = useRouter();
  const { householdId, can } = useHousehold();
  const canWrite = can('home.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const query = useQuery({
    queryKey: ['home', 'assets.get', householdId, assetId],
    queryFn: () => api.home.assets.get({ params: { householdId, assetId } }),
  });
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const remove = useMutation({
    mutationFn: () => api.home.assets.remove({ params: { householdId, assetId } }),
    onSuccess: async () => {
      toast.success(t('assets.deleted'));
      router.push('/home-assets');
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: toastError,
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-2">
      <Link href="/home-assets">
        <ArrowLeft aria-hidden />
        {t('assets.back')}
      </Link>
    </Button>
  );

  if (query.isPending) return <LoadingState rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404)
      return (
        <div>
          {back}
          <EmptyState title={t('assets.notFound')} />
        </div>
      );
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const asset = query.data;
  const Icon = KIND_ICON[asset.kind];
  const details = Object.entries(asset.details);

  return (
    <div>
      {back}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className="size-6 text-primary" aria-hidden />
            {asset.name}
          </span>
        }
        description={t(`kinds.${asset.kind}`)}
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                {tc('edit')}
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)} aria-label={tc('delete')}>
                <Trash2 aria-hidden />
              </Button>
            </>
          ) : null
        }
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center gap-2">
            <CardTitle className="flex-1">{t('assets.details')}</CardTitle>
            <WarrantyBadge until={asset.warrantyUntil} />
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
              {asset.purchaseDate ? (
                <>
                  <dt className="text-muted">{t('assets.purchaseDate')}</dt>
                  <dd>{fmt.date(asset.purchaseDate)}</dd>
                </>
              ) : null}
              {asset.warrantyUntil ? (
                <>
                  <dt className="text-muted">{t('assets.warrantyUntil')}</dt>
                  <dd>{fmt.date(asset.warrantyUntil)}</dd>
                </>
              ) : null}
              {details.map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            {asset.notes ? <p className="mt-3 text-sm whitespace-pre-line">{asset.notes}</p> : null}
          </CardContent>
        </Card>
        <section aria-labelledby="maintenance-heading" className="grid gap-3">
          <h2 id="maintenance-heading" className="text-lg font-semibold">
            {t('maintenance.title')}
          </h2>
          <MaintenanceList asset={asset} />
        </section>
        <MetersSection asset={asset} />
      </div>
      <AssetDialog open={editing} onOpenChange={setEditing} asset={asset} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('assets.deleteTitle', { name: asset.name })}
        description={t('assets.deleteBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

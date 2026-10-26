'use client';

import { apiQuery } from '@fp/api-client';
import type { AssistantSettings } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, CloudOff, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModuleGate, UpsellState } from '@/components/upsell';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFeature } from '@/lib/entitlements';
import { useFormat } from '@/lib/use-format';
import { AssistantErrorAlert } from './assistant-errors';
import { CapturePanel, InsightsPanel, MealsPanel, ReceiptPanel } from './panels';

export function AssistantPage() {
  return (
    <ModuleGate action="assistant.read">
      <AssistantContent />
    </ModuleGate>
  );
}

function useSettingsKey() {
  const { householdId } = useHousehold();
  return apiQuery(api, 'assistant', 'settings', { params: { householdId } }).queryKey;
}

function AssistantContent() {
  const t = useTranslations('assistant');
  const { householdId } = useHousehold();
  const feature = useFeature('ai_assistant');
  const settingsQuery = useQuery({
    ...apiQuery(api, 'assistant', 'settings', { params: { householdId } }),
    enabled: feature.enabled === true,
  });

  const header = <PageHeader title={t('title')} description={t('description')} />;

  if (feature.enabled === undefined) {
    return (
      <div>
        {header}
        <LoadingState rows={3} />
      </div>
    );
  }
  if (!feature.enabled) {
    return (
      <div>
        {header}
        <UpsellState feature="ai_assistant" />
        <ConsentExplainer className="mt-6" />
      </div>
    );
  }
  if (settingsQuery.isPending) {
    return (
      <div>
        {header}
        <LoadingState rows={3} />
      </div>
    );
  }
  if (settingsQuery.isError) {
    return (
      <div>
        {header}
        <ErrorState error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />
      </div>
    );
  }

  const settings = settingsQuery.data;
  if (!settings.enabled) {
    return (
      <div>
        {header}
        <ConsentCard />
      </div>
    );
  }

  return (
    <div>
      {header}
      {!settings.available ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <CloudOff className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-semibold">{t('unavailable.title')}</p>
            <p className="text-muted">{t('unavailable.body')}</p>
          </div>
        </div>
      ) : null}
      <AssistantTabs settings={settings} />
    </div>
  );
}

type TabKey = 'capture' | 'receipt' | 'insights' | 'meals' | 'settings';

function AssistantTabs({ settings }: { settings: AssistantSettings }) {
  const t = useTranslations('assistant.tabs');
  const { can } = useHousehold();
  const tabs: TabKey[] = [
    'capture',
    ...(can('finance.write') ? (['receipt'] as const) : []),
    ...(can('finance.read') ? (['insights'] as const) : []),
    'meals',
    'settings',
  ];
  const [tab, setTab] = React.useState<TabKey>('capture');
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList>
          {tabs.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(key)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="capture">
        <CapturePanel />
      </TabsContent>
      {tabs.includes('receipt') ? (
        <TabsContent value="receipt">
          <ReceiptPanel />
        </TabsContent>
      ) : null}
      {tabs.includes('insights') ? (
        <TabsContent value="insights">
          <InsightsPanel />
        </TabsContent>
      ) : null}
      <TabsContent value="meals">
        <MealsPanel />
      </TabsContent>
      <TabsContent value="settings">
        <SettingsPanel settings={settings} />
      </TabsContent>
    </Tabs>
  );
}

function isManager(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

/** What enabling the assistant means; shown on the consent card and next to the upsell. */
function ConsentExplainer({ className }: { className?: string }) {
  const t = useTranslations('assistant.consent');
  return (
    <div className={className}>
      <p className="text-sm text-muted">{t('body')}</p>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {(['optIn', 'confirm', 'revoke'] as const).map((k) => (
          <li key={k} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            {t(`points.${k}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConsentCard() {
  const t = useTranslations('assistant.consent');
  const { householdId, member } = useHousehold();
  const queryClient = useQueryClient();
  const key = useSettingsKey();
  const [agreed, setAgreed] = React.useState(false);
  const manager = isManager(member.role);

  const enable = useMutation({
    mutationFn: () => api.assistant.enable({ params: { householdId }, body: { consent: true } }),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      toast.success(t('enabled'));
    },
  });

  return (
    <Card className="max-w-2xl" data-testid="assistant-consent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ConsentExplainer />
        {manager ? (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (agreed) enable.mutate();
            }}
          >
            <div className="flex items-start gap-2">
              <Checkbox
                id="assistant-consent"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
              />
              <Label htmlFor="assistant-consent" className="leading-snug font-normal">
                {t('checkbox')}
              </Label>
            </div>
            {enable.isError ? <AssistantErrorAlert error={enable.error} /> : null}
            <div>
              <Button type="submit" disabled={!agreed} loading={enable.isPending}>
                <Bot aria-hidden />
                {t('enable')}
              </Button>
            </div>
          </form>
        ) : (
          <p role="status" className="rounded-md bg-surface-muted p-3 text-sm">
            {t('askAdmin')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsPanel({ settings }: { settings: AssistantSettings }) {
  const t = useTranslations('assistant.settings');
  const fmt = useFormat();
  const { householdId, member, memberById } = useHousehold();
  const queryClient = useQueryClient();
  const key = useSettingsKey();
  const [confirm, setConfirm] = React.useState(false);
  const manager = isManager(member.role);
  const consentedBy = memberById(settings.consentedByMemberId);

  const disable = useMutation({
    mutationFn: () => api.assistant.disable({ params: { householdId } }),
    onSuccess: (next) => {
      setConfirm(false);
      queryClient.setQueryData(key, next);
      toast.success(t('disabled'));
    },
  });

  const usedPct = settings.dailyLimit > 0 ? (settings.usedToday / settings.dailyLimit) * 100 : 0;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        {settings.consentedAt ? (
          <CardDescription>
            {t('consentedBy', {
              name: consentedBy?.displayName ?? '?',
              date: fmt.date(settings.consentedAt),
            })}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">{t('status')}:</span>
          <Badge variant={settings.enabled ? 'success' : 'secondary'}>
            {settings.enabled ? t('on') : t('off')}
          </Badge>
        </div>
        <div className="grid gap-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted">{t('usage')}</span>
            <span className="tabular-nums">
              {t('usageValue', { used: settings.usedToday, limit: settings.dailyLimit })}
            </span>
          </div>
          <Progress
            value={usedPct}
            tone={usedPct >= 100 ? 'exceeded' : usedPct >= 80 ? 'warning' : 'default'}
            aria-label={t('usage')}
          />
        </div>
        {disable.isError ? <AssistantErrorAlert error={disable.error} /> : null}
        {manager ? (
          <div>
            <Button variant="destructive" onClick={() => setConfirm(true)}>
              {t('disable')}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">{t('onlyAdmins')}</p>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('disableTitle')}
        description={t('disableBody')}
        confirmLabel={t('disable')}
        destructive
        loading={disable.isPending}
        onConfirm={() => disable.mutate()}
      />
    </Card>
  );
}

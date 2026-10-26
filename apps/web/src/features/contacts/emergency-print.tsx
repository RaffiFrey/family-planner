'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Phone, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { MemberAvatar } from '@/components/member-avatar';
import { ErrorState, LoadingState } from '@/components/states';
import { ModuleGate } from '@/components/upsell';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #emergency-card, #emergency-card * { visibility: visible !important; }
  #emergency-card { position: absolute; left: 0; top: 0; width: 100%; }
  @page { margin: 12mm; }
}`;

/**
 * Printable emergency card. In print media everything except the card is hidden
 * (app chrome included), so the browser's print dialog produces a clean card.
 */
export function EmergencyPrint({ memberId }: { memberId: string }) {
  return (
    <ModuleGate action="contacts.read">
      <EmergencyPrintInner memberId={memberId} />
    </ModuleGate>
  );
}

function EmergencyPrintInner({ memberId }: { memberId: string }) {
  const t = useTranslations('contacts.emergency');
  const tc = useTranslations('contacts');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const query = useQuery({
    queryKey: ['contacts', 'emergency.summary', householdId, memberId],
    queryFn: () => api.contacts.emergency.summary({ params: { householdId, memberId } }),
  });

  let body: React.ReactNode;
  if (query.isPending) body = <LoadingState rows={4} />;
  else if (query.isError)
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  else {
    const { member, card, doctor, emergencyContacts, generatedAt } = query.data;
    const rows: [string, string][] = [
      [
        t('bloodType'),
        !card?.bloodType
          ? t('none')
          : card.bloodType === 'unknown'
            ? t('bloodUnknown')
            : card.bloodType,
      ],
      [t('allergies'), card?.allergies.join(', ') || t('none')],
      [t('conditions'), card?.conditions.join(', ') || t('none')],
      [t('medications'), card?.medications || t('none')],
      [t('insuranceProvider'), card?.insuranceProvider || t('none')],
      [
        t('insuranceNumber'),
        card?.insuranceNumber ??
          (card?.insuranceNumberLast4 ? `•••• ${card.insuranceNumberLast4}` : t('none')),
      ],
    ];
    body = (
      <>
        <article
          id="emergency-card"
          aria-labelledby="emergency-card-title"
          className="overflow-hidden rounded-xl border-2 border-danger bg-background text-foreground"
        >
          <header className="flex items-center gap-3 bg-danger px-4 py-3 text-white">
            <span className="text-3xl leading-none font-black" aria-hidden>
              +
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wider uppercase">{t('cardTitle')}</p>
              <h1 id="emergency-card-title" className="truncate text-xl font-bold">
                {member.displayName}
              </h1>
            </div>
            <MemberAvatar member={{ ...member, avatarUrl: null }} size="lg" />
          </header>
          <div className="grid gap-4 p-4">
            {member.birthday ? (
              <p className="text-sm">{t('born', { date: fmt.date(member.birthday) })}</p>
            ) : null}
            <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold">{k}</dt>
                  <dd className="whitespace-pre-line">{v}</dd>
                </div>
              ))}
            </dl>
            {doctor ? (
              <section aria-labelledby="ec-doctor">
                <h2 id="ec-doctor" className="mb-1 text-sm font-semibold">
                  {t('doctor')}
                </h2>
                <ContactLine
                  name={
                    doctor.organization ? `${doctor.name} (${doctor.organization})` : doctor.name
                  }
                  phones={doctor.phones}
                />
              </section>
            ) : null}
            <section aria-labelledby="ec-contacts">
              <h2 id="ec-contacts" className="mb-1 text-sm font-semibold">
                {t('emergencyContacts')}
              </h2>
              {emergencyContacts.length === 0 ? (
                <p className="text-sm">{t('none')}</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {emergencyContacts.map((c) => (
                    <li key={c.id}>
                      <ContactLine
                        name={`${c.name} · ${tc(`categories.${c.category}`)}`}
                        phones={c.phones}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {card?.notes ? (
              <section aria-labelledby="ec-notes">
                <h2 id="ec-notes" className="mb-1 text-sm font-semibold">
                  {t('notes')}
                </h2>
                <p className="text-sm whitespace-pre-line">{card.notes}</p>
              </section>
            ) : null}
            <p className="text-xs text-muted">
              {t('updated', { date: fmt.dateTime(card?.updatedAt ?? generatedAt) })}
            </p>
          </div>
        </article>
        <p className="mt-3 text-xs text-muted print:hidden">{t('printHint')}</p>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" asChild>
          <Link href="/contacts">
            <ArrowLeft aria-hidden />
            {t('back')}
          </Link>
        </Button>
        <Button onClick={() => window.print()} disabled={!query.data}>
          <Printer aria-hidden />
          {t('printNow')}
        </Button>
      </div>
      {body}
    </div>
  );
}

function ContactLine({
  name,
  phones,
}: {
  name: string;
  phones: { label: string | null; number: string }[];
}) {
  return (
    <div className="text-sm">
      <p className="font-medium">{name}</p>
      {phones.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 tabular-nums">
          <Phone className="size-3" aria-hidden />
          {p.number}
          {p.label ? <span className="text-muted">({p.label})</span> : null}
        </p>
      ))}
    </div>
  );
}

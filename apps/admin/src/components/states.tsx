'use client';

import { AlertTriangleIcon, InboxIcon, ShieldOffIcon } from 'lucide-react';
import * as React from 'react';
import { ApiError } from '@fp/contracts';
import { Button } from '@/components/ui/button';
import { errorMessage, isMissingRole } from '@/lib/api';

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
}) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const Icon = forbidden ? ShieldOffIcon : AlertTriangleIcon;
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="size-5 text-danger" />
      <p className="text-sm font-medium">
        {isMissingRole(error)
          ? 'Missing staff role'
          : forbidden
            ? 'Access denied'
            : 'Could not load data'}
      </p>
      <p className="max-w-md text-xs text-muted">{errorMessage(error)}</p>
      {onRetry && !forbidden ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <InboxIcon className="size-5 text-muted" />
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="text-xs text-muted">{children}</div> : null}
    </div>
  );
}

/** Shown instead of a page whose data the staff member's roles cannot read anyway. */
export function MissingRoleState({ role }: { role: string }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center">
      <ShieldOffIcon className="size-5 text-danger" />
      <p className="text-sm font-medium">Missing staff role</p>
      <p className="max-w-md text-xs text-muted">This page requires the {role} role.</p>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

'use client';

import { HouseholdSwitcher } from './household-switcher';
import { NotificationsBell } from './notifications-bell';
import { UserMenu } from './user-menu';

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-6">
      <div className="min-w-0 flex-1 lg:hidden">
        <HouseholdSwitcher compact />
      </div>
      <div className="hidden flex-1 lg:block" />
      <NotificationsBell />
      <UserMenu />
    </header>
  );
}

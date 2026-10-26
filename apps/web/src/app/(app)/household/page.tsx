import { redirect } from 'next/navigation';

/** Notification deep links use `/household`; members live under settings. */
export default function HouseholdRedirect(): never {
  redirect('/settings/members');
}

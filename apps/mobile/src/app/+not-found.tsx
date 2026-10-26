import { Redirect } from 'expo-router';
import { LoadingView } from '@/components/ui';
import { useMe } from '@/features/household/household';
import { authClient } from '@/lib/auth-client';

/**
 * Unknown or currently protected URLs (e.g. "/" while signed out on web) lead to the screen that
 * fits the auth state instead of a dead end.
 */
export default function NotFoundScreen() {
  const session = authClient.useSession();
  const signedIn = !!session.data?.user;
  const me = useMe(signedIn);
  if (session.isPending) return <LoadingView />;
  if (!signedIn) return <Redirect href="/sign-in" />;
  if (!me.data) return <LoadingView />;
  return <Redirect href={me.data.memberships.length > 0 ? '/' : '/onboarding'} />;
}

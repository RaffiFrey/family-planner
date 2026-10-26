import { useLocalSearchParams } from 'expo-router';
import { ErrorState, LoadingView } from '@/components/ui';
import { EventForm } from '@/features/calendar/event-form';
import { useEvent } from '@/features/calendar/hooks';

export default function EventScreen() {
  const { eventId, occurrenceStart } = useLocalSearchParams<{
    eventId: string;
    occurrenceStart?: string;
  }>();
  const query = useEvent(eventId);
  if (query.data) {
    return (
      <EventForm
        key={`${query.data.id}-${occurrenceStart ?? ''}`}
        event={query.data}
        {...(occurrenceStart ? { occurrenceStart } : {})}
      />
    );
  }
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <LoadingView />;
}

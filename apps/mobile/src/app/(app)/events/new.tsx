import { useLocalSearchParams } from 'expo-router';
import { EventForm } from '@/features/calendar/event-form';

export default function NewEventScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <EventForm {...(date ? { initialDate: date } : {})} />;
}

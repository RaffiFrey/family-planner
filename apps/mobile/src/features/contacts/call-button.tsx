import { Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import { notify } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { callNumber } from './call';

/** Round "call" button; shows the number when the device cannot place calls. */
export function CallButton({ name, number }: { name: string; number: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <IconButton
      label={t('m.contacts.callLabel', { name, number })}
      className="bg-success"
      onPress={() => {
        void callNumber(number).then((ok) => {
          if (!ok) notify(t('m.contacts.cannotCall'), `${name}: ${number}`);
        });
      }}
    >
      <Phone size={20} color={colors.primaryText} />
    </IconButton>
  );
}

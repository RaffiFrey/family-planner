import type { Contact, ContactCategory } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  ChipMultiSelect,
  ChipSelect,
  ErrorState,
  IconButton,
  LoadingView,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { CONTACT_CATEGORIES, useContact } from '@/features/contacts/hooks';
import { useHousehold, useMembers } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage, FormError } from '@/lib/errors';
import { useColors } from '@/lib/theme';

const PHONE_RE = /^[+0-9 ()/.-]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EditContactScreen() {
  const { contactId } = useLocalSearchParams<{ contactId?: string }>();
  const existing = useContact(contactId ?? '', !!contactId);
  if (contactId && existing.isPending) return <LoadingView />;
  if (contactId && existing.error && !existing.data)
    return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  return <ContactForm key={contactId ?? 'new'} contact={contactId ? existing.data : undefined} />;
}

interface PhoneDraft {
  label: string;
  number: string;
}

function ContactForm({ contact }: { contact: Contact | undefined }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId } = useHousehold();
  const members = useMembers();
  const queryClient = useQueryClient();
  const [name, setName] = useState(contact?.name ?? '');
  const [category, setCategory] = useState<ContactCategory>(contact?.category ?? 'doctor');
  const [organization, setOrganization] = useState(contact?.organization ?? '');
  const [phones, setPhones] = useState<PhoneDraft[]>(
    contact?.phones.length
      ? contact.phones.map((p) => ({ label: p.label ?? '', number: p.number }))
      : [{ label: '', number: '' }],
  );
  const [email, setEmail] = useState(contact?.email ?? '');
  const [address, setAddress] = useState(contact?.address ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(contact?.memberIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new FormError(t('m.contacts.nameRequired'));
      const cleanPhones = phones
        .filter((p) => p.number.trim() !== '')
        .map((p) => ({ label: p.label.trim() || null, number: p.number.trim() }));
      if (cleanPhones.some((p) => !PHONE_RE.test(p.number)))
        throw new FormError(t('m.contacts.invalidPhone'));
      if (email.trim() && !EMAIL_RE.test(email.trim()))
        throw new FormError(t('m.auth.invalidEmail'));
      const body = {
        name: name.trim(),
        category,
        organization: organization.trim() || null,
        phones: cleanPhones,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        memberIds,
      };
      return contact
        ? api.contacts.update({ params: { householdId, contactId: contact.id }, body })
        : api.contacts.create({ params: { householdId }, body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      router.back();
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{ title: contact ? t('m.contacts.editTitle') : t('m.contacts.newTitle') }}
      />
      <TextField
        label={t('common.name')}
        value={name}
        onChangeText={setName}
        autoFocus={!contact}
      />
      <ChipSelect
        label={t('m.contacts.category')}
        options={CONTACT_CATEGORIES.map((c) => ({
          value: c,
          label: t(`m.contacts.categories.${c}`),
        }))}
        value={category}
        onChange={setCategory}
      />
      <TextField
        label={t('m.contacts.organization')}
        value={organization}
        onChangeText={setOrganization}
        placeholder={t('m.contacts.organizationPlaceholder')}
      />
      <View className="gap-2">
        <Text variant="label">{t('m.contacts.phones')}</Text>
        {phones.map((p, i) => (
          <View key={i} className="flex-row items-end gap-2">
            <TextField
              className="w-28"
              value={p.label}
              placeholder={t('m.contacts.phoneLabelPlaceholder')}
              accessibilityLabel={t('m.contacts.phoneLabel')}
              onChangeText={(v) => {
                setPhones(phones.map((x, j) => (j === i ? { ...x, label: v } : x)));
              }}
            />
            <TextField
              className="flex-1"
              value={p.number}
              keyboardType="phone-pad"
              placeholder="+49 30 1234567"
              accessibilityLabel={t('m.contacts.phone')}
              onChangeText={(v) => {
                setPhones(phones.map((x, j) => (j === i ? { ...x, number: v } : x)));
              }}
            />
            {phones.length > 1 ? (
              <IconButton
                label={t('m.contacts.removePhone')}
                onPress={() => {
                  setPhones(phones.filter((_, j) => j !== i));
                }}
              >
                <X size={20} color={colors.textMuted} />
              </IconButton>
            ) : null}
          </View>
        ))}
        {phones.length < 10 ? (
          <Button
            variant="ghost"
            size="sm"
            title={t('m.contacts.addPhone')}
            icon={<Plus size={18} color={colors.primary} />}
            onPress={() => {
              setPhones([...phones, { label: '', number: '' }]);
            }}
          />
        ) : null}
      </View>
      <TextField
        label={t('common.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label={t('m.contacts.address')}
        value={address}
        onChangeText={setAddress}
        multiline
      />
      <ChipMultiSelect
        label={t('m.contacts.belongsTo')}
        options={members.map((m) => ({ value: m.id, label: m.displayName, color: m.color }))}
        value={memberIds}
        onChange={setMemberIds}
      />
      <TextField label={t('m.contacts.notes')} value={notes} onChangeText={setNotes} multiline />
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={t('common.save')}
        loading={save.isPending}
        onPress={() => {
          setError(null);
          save.mutate();
        }}
      />
    </ScreenScroll>
  );
}

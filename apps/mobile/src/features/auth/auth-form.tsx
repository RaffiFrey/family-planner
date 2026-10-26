import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { z } from 'zod';
import { Button, ScreenScroll, Text, TextField } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useConnectivity } from '@/lib/connectivity';

const SignInSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});
const SignUpSchema = SignInSchema.extend({ name: z.string().trim().min(1).max(100) });
type FormValues = z.infer<typeof SignUpSchema>;

/** Email + password sign in / sign up (Better Auth). The session cookie is stored in SecureStore. */
export function AuthForm({ mode }: { mode: 'signIn' | 'signUp' }) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const schema =
    mode === 'signUp' ? SignUpSchema : SignInSchema.extend({ name: z.string().optional() });
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { email: '', password: '', name: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result =
        mode === 'signUp'
          ? await authClient.signUp.email({
              email: values.email.trim(),
              password: values.password,
              name: values.name.trim(),
            })
          : await authClient.signIn.email({
              email: values.email.trim(),
              password: values.password,
            });
      if (result.error) {
        setServerError(result.error.message ?? t('m.auth.failed'));
        return;
      }
      useConnectivity.getState().setOnline(true);
    } catch {
      setServerError(t('common.offline'));
    }
  });

  return (
    <ScreenScroll className="flex-grow justify-center">
      <View className="gap-1 pb-4">
        <Text variant="title">{t('common.appName')}</Text>
        <Text variant="caption">
          {mode === 'signUp' ? t('m.auth.signUpIntro') : t('m.auth.signInIntro')}
        </Text>
      </View>
      {mode === 'signUp' ? (
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <TextField
              label={t('common.name')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoComplete="name"
              textContentType="name"
              error={formState.errors.name ? t('m.auth.nameRequired') : undefined}
            />
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label={t('common.email')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            error={formState.errors.email ? t('m.auth.invalidEmail') : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label={t('common.password')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            secureTextEntry
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
            error={formState.errors.password ? t('m.auth.passwordTooShort') : undefined}
          />
        )}
      />
      {serverError ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {serverError}
        </Text>
      ) : null}
      <Button
        title={mode === 'signUp' ? t('common.signUp') : t('common.signIn')}
        loading={formState.isSubmitting}
        onPress={() => void onSubmit()}
      />
      <Link href={mode === 'signUp' ? '/sign-in' : '/sign-up'} replace asChild>
        <Button
          variant="ghost"
          title={mode === 'signUp' ? t('m.auth.haveAccount') : t('m.auth.noAccount')}
        />
      </Link>
    </ScreenScroll>
  );
}

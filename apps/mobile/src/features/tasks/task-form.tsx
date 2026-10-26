import type { Task } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import {
  Button,
  Card,
  ChipMultiSelect,
  ChipSelect,
  DateField,
  IconButton,
  ScreenScroll,
  Segmented,
  Text,
  TextField,
} from '@/components/ui';
import { useHousehold, useMembers } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { errorMessage, FormError } from '@/lib/errors';
import { useColors } from '@/lib/theme';
import { useCompleteTask } from './hooks';
import {
  type FixedPreset,
  type FloatingUnit,
  fromTaskRecurrence,
  type RecurrenceFormState,
  type RecurrenceMode,
  toTaskRecurrence,
} from './recurrence-form';

type Priority = 'low' | 'normal' | 'high';
type Visibility = 'household' | 'private' | 'members';
interface ChecklistDraft {
  key: string;
  text: string;
  done: boolean;
}

const FIXED_PRESETS: FixedPreset[] = [
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
];

let draftCounter = 0;
const nextKey = () => `c${String(++draftCounter)}`;

/** Create/edit form for tasks and chores (recurrence, rotation, points, checklist). */
export function TaskForm({ task }: { task?: Task }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId, can } = useHousehold();
  const members = useMembers();
  const queryClient = useQueryClient();
  const complete = useCompleteTask();

  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [assignee, setAssignee] = useState<string>(task?.assigneeMemberId ?? 'none');
  const [due, setDue] = useState<Date | null>(task?.dueAt ? new Date(task.dueAt) : null);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [recurrence, setRecurrence] = useState<RecurrenceFormState>(
    fromTaskRecurrence(task?.recurrence),
  );
  const [rotation, setRotation] = useState<string[]>(task?.rotationMemberIds ?? []);
  const [points, setPoints] = useState(String(task?.points ?? 0));
  const [visibility, setVisibility] = useState<Visibility>(task?.visibility ?? 'household');
  const [checklist, setChecklist] = useState<ChecklistDraft[]>(
    (task?.checklist ?? []).map((c) => ({ key: c.id, text: c.text, done: c.done })),
  );
  const [newItem, setNewItem] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setRec = (patch: Partial<RecurrenceFormState>) => {
    setRecurrence((r) => ({ ...r, ...patch }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const rec = toTaskRecurrence(recurrence);
      if (!rec.ok) throw new FormError(t('m.tasks.invalidInterval'));
      if (rec.value && !due) throw new FormError(t('m.tasks.recurringNeedsDue'));
      const pointsNum = /^\d+$/.test(points.trim()) ? Number(points.trim()) : 0;
      const body = {
        title: title.trim(),
        notes: notes.trim() === '' ? null : notes.trim(),
        assigneeMemberId: assignee === 'none' ? null : assignee,
        dueAt: due ? due.toISOString() : null,
        priority,
        recurrence: rec.value,
        rotationMemberIds: rec.value ? rotation : [],
        points: Math.min(1000, pointsNum),
        checklist: checklist
          .filter((c) => c.text.trim() !== '')
          .map((c) => ({ text: c.text.trim(), done: c.done })),
        visibility,
      };
      return task
        ? api.tasks.update({ params: { householdId, taskId: task.id }, body })
        : api.tasks.create({ params: { householdId }, body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      router.back();
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const remove = useMutation({
    mutationFn: () => api.tasks.remove({ params: { householdId, taskId: task?.id ?? '' } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      router.back();
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const confirmDelete = () => {
    void confirmAsync(t('m.tasks.deleteTitle'), t('m.tasks.deleteMessage'), {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    }).then((ok) => {
      if (ok) remove.mutate();
    });
  };

  const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName, color: m.color }));
  const editable = can('tasks.write');

  return (
    <ScreenScroll>
      <TextField
        label={t('m.tasks.title')}
        value={title}
        onChangeText={setTitle}
        autoFocus={!task}
        editable={editable}
      />
      <ChipSelect
        label={t('m.tasks.assignee')}
        options={[{ value: 'none', label: t('common.none') }, ...memberOptions]}
        value={assignee}
        onChange={setAssignee}
      />
      <DateField label={t('m.tasks.due')} value={due} onChange={setDue} mode="datetime" clearable />
      <View className="gap-2">
        <Text variant="label">{t('m.tasks.priority')}</Text>
        <Segmented
          options={(['low', 'normal', 'high'] as const).map((p) => ({
            value: p,
            label: t(`priority.${p}`),
          }))}
          value={priority}
          onChange={setPriority}
        />
      </View>

      <Card>
        <Text variant="subheading">{t('m.tasks.repeat')}</Text>
        <Segmented<RecurrenceMode>
          label={t('m.tasks.repeat')}
          options={[
            { value: 'none', label: t('recurrence.none') },
            { value: 'fixed', label: t('recurrence.fixed') },
            { value: 'floating', label: t('recurrence.floating') },
          ]}
          value={recurrence.mode}
          onChange={(mode) => {
            setRec({ mode });
          }}
        />
        {recurrence.mode === 'fixed' ? (
          <ChipSelect<FixedPreset | 'custom'>
            options={[
              ...FIXED_PRESETS.map((p) => ({ value: p, label: t(`m.recurrence.${p}`) })),
              ...(recurrence.customRule
                ? [{ value: 'custom' as const, label: t('m.recurrence.custom') }]
                : []),
            ]}
            value={recurrence.preset}
            onChange={(preset) => {
              setRec({ preset });
            }}
          />
        ) : null}
        {recurrence.mode === 'floating' ? (
          <View className="gap-2">
            <Text variant="caption">{t('m.tasks.floatingHint')}</Text>
            <View className="flex-row items-end gap-2">
              <TextField
                className="w-24"
                label={t('m.tasks.every')}
                value={recurrence.interval}
                onChangeText={(interval) => {
                  setRec({ interval });
                }}
                keyboardType="number-pad"
                maxLength={4}
              />
              <View className="flex-1">
                <Segmented<FloatingUnit>
                  options={(['day', 'week', 'month', 'year'] as const).map((u) => ({
                    value: u,
                    label: t(`m.recurrence.units.${u}`),
                  }))}
                  value={recurrence.unit}
                  onChange={(unit) => {
                    setRec({ unit });
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}
        {recurrence.mode !== 'none' ? (
          <ChipMultiSelect
            label={t('m.tasks.rotation')}
            options={memberOptions}
            value={rotation}
            onChange={setRotation}
          />
        ) : null}
        {recurrence.mode !== 'none' && rotation.length > 0 ? (
          <Text variant="caption">{t('m.tasks.rotationHint')}</Text>
        ) : null}
      </Card>

      <TextField
        label={t('m.tasks.points')}
        value={points}
        onChangeText={setPoints}
        keyboardType="number-pad"
        maxLength={4}
      />

      <Card>
        <Text variant="subheading">{t('m.tasks.checklist')}</Text>
        {checklist.map((item) => (
          <View key={item.key} className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              accessibilityLabel={item.text}
              onPress={() => {
                setChecklist((list) =>
                  list.map((c) => (c.key === item.key ? { ...c, done: !c.done } : c)),
                );
              }}
              className={`h-6 w-6 rounded border-2 ${item.done ? 'border-success bg-success' : 'border-border'}`}
            />
            <Text className={`flex-1 ${item.done ? 'text-muted line-through' : ''}`}>
              {item.text}
            </Text>
            <IconButton
              label={t('common.delete')}
              onPress={() => {
                setChecklist((list) => list.filter((c) => c.key !== item.key));
              }}
            >
              <Trash2 size={18} color={colors.textMuted} />
            </IconButton>
          </View>
        ))}
        <View className="flex-row items-end gap-2">
          <TextField
            className="flex-1"
            placeholder={t('m.tasks.addChecklistItem')}
            accessibilityLabel={t('m.tasks.addChecklistItem')}
            value={newItem}
            onChangeText={setNewItem}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (newItem.trim() === '') return;
              setChecklist((list) => [
                ...list,
                { key: nextKey(), text: newItem.trim(), done: false },
              ]);
              setNewItem('');
            }}
          />
          <IconButton
            label={t('m.tasks.addChecklistItem')}
            onPress={() => {
              if (newItem.trim() === '') return;
              setChecklist((list) => [
                ...list,
                { key: nextKey(), text: newItem.trim(), done: false },
              ]);
              setNewItem('');
            }}
          >
            <Plus size={22} color={colors.primary} />
          </IconButton>
        </View>
      </Card>

      <ChipSelect<Visibility>
        label={t('m.common.visibility')}
        options={(['household', 'private'] as const).map((v) => ({
          value: v,
          label: t(`visibility.${v}`),
        }))}
        value={visibility}
        onChange={setVisibility}
      />
      <TextField label={t('m.tasks.notes')} value={notes} onChangeText={setNotes} multiline />

      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {editable ? (
        <Button
          title={t('common.save')}
          disabled={title.trim() === ''}
          loading={save.isPending}
          onPress={() => {
            setError(null);
            save.mutate();
          }}
        />
      ) : null}
      {task && task.status === 'open' && can('tasks.complete') ? (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant="secondary"
            title={t('m.tasks.complete')}
            onPress={() => {
              complete.mutate({ task, skip: false });
              router.back();
            }}
          />
          {task.recurrence ? (
            <Button
              className="flex-1"
              variant="secondary"
              title={t('m.tasks.skip')}
              onPress={() => {
                complete.mutate({ task, skip: true });
                router.back();
              }}
            />
          ) : null}
        </View>
      ) : null}
      {task && editable ? (
        <Button
          variant="ghost"
          title={t('common.delete')}
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      ) : null}
      {task && task.streak > 1 ? (
        <Text variant="caption">{t('m.tasks.streak', { count: task.streak })}</Text>
      ) : null}
    </ScreenScroll>
  );
}

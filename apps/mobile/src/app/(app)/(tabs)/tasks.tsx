import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  EmptyState,
  ErrorState,
  Fab,
  LoadingView,
  RowGroup,
  Segmented,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { groupTasks } from '@/features/tasks/grouping';
import { useTasks } from '@/features/tasks/hooks';
import { TaskRow } from '@/features/tasks/task-row';
import { useNow } from '@/lib/use-now';

type Filter = 'mine' | 'all' | 'done';

export default function TasksScreen() {
  const { t } = useTranslation();
  const { me, can } = useHousehold();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useTasks(filter === 'done' ? 'done' : 'open');
  const tasks = (query.data ?? []).filter(
    (task) => filter !== 'mine' || task.assigneeMemberId === me.id,
  );

  let content;
  if (query.isPending) content = <LoadingView />;
  else if (query.error && !query.data)
    content = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  else if (tasks.length === 0) {
    content = (
      <EmptyState title={filter === 'done' ? t('m.tasks.noneDone') : t('m.tasks.allDone')} />
    );
  } else if (filter === 'done') {
    content = (
      <RowGroup>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} now={now} />
        ))}
      </RowGroup>
    );
  } else {
    content = groupTasks(tasks, now).map(({ group, tasks: groupTasksList }) => (
      <View key={group} className="gap-2">
        <Text
          variant="subheading"
          accessibilityRole="header"
          className={group === 'overdue' ? 'text-danger' : ''}
        >
          {t(`m.tasks.groups.${group}`)} ({groupTasksList.length})
        </Text>
        <RowGroup>
          {groupTasksList.map((task) => (
            <TaskRow key={task.id} task={task} now={now} />
          ))}
        </RowGroup>
      </View>
    ));
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        <Segmented
          label={t('m.tasks.filter')}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'mine', label: t('m.tasks.mine') },
            { value: 'done', label: t('common.done') },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {content}
      </ScrollView>
      {can('tasks.write') ? (
        <Fab
          label={t('m.tasks.newTask')}
          onPress={() => {
            router.push('/tasks/new');
          }}
        />
      ) : null}
    </View>
  );
}

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { finBudgetAlerts, finCategories, householdMembers, households, withTenant } from '@fp/db';
import { categoryLabel } from '@fp/i18n';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HouseholdContext } from '../../common/request-context.js';
import { Db } from '../../infra/database.js';
import { Queues } from '../events/queues.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FinanceService } from './finance.service.js';

/** No real member: visibility filters then only include household-wide accounts. */
const SYSTEM_MEMBER = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class FinanceEvents implements OnModuleInit {
  constructor(
    private readonly queues: Queues,
    private readonly db: Db,
    private readonly finance: FinanceService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.queues.on('events', 'finance.budget_check', (job) =>
      this.checkBudgets((job.data as { householdId: string }).householdId),
    );
  }

  /** Fires budget warning/exceeded notifications once per budget period. */
  async checkBudgets(householdId: string): Promise<void> {
    const [h] = await this.db.system
      .select()
      .from(households)
      .where(eq(households.id, householdId));
    if (!h || h.deletedAt) return;
    const ctx: HouseholdContext = {
      userId: 'system',
      email: '',
      name: 'system',
      locale: 'de',
      householdId,
      member: {
        id: SYSTEM_MEMBER,
        householdId,
        role: 'owner',
        displayName: 'system',
        grantedModules: null,
        accessUntil: null,
      },
      household: {
        id: h.id,
        name: h.name,
        timezone: h.timezone,
        currency: h.currency,
        locale: h.locale,
        plan: h.plan,
      },
    };
    const fired = await withTenant(this.db.app, householdId, async (tx) => {
      const statuses = await this.finance.budgetStatuses(tx, ctx, new Date());
      const out: { level: 'warning' | 'exceeded'; categoryId: string; percent: number }[] = [];
      for (const s of statuses) {
        if (s.level === 'ok') continue;
        const [inserted] = await tx
          .insert(finBudgetAlerts)
          .values({
            householdId,
            budgetId: s.budget.id,
            periodStart: new Date(s.periodStart),
            level: s.level,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted)
          out.push({
            level: s.level,
            categoryId: s.budget.categoryId,
            percent: Math.round(s.ratio * 100),
          });
      }
      return out;
    });
    if (fired.length === 0) return;
    const adults = await this.db.system
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          isNull(householdMembers.removedAt),
          inArray(householdMembers.role, ['owner', 'admin', 'adult']),
        ),
      );
    const cats = await this.db.system
      .select()
      .from(finCategories)
      .where(
        inArray(
          finCategories.id,
          fired.map((f) => f.categoryId),
        ),
      );
    for (const f of fired) {
      const cat = cats.find((c) => c.id === f.categoryId);
      await this.notifications.notify({
        householdId,
        memberIds: adults.map((a) => a.id),
        type: f.level === 'warning' ? 'budget.warning' : 'budget.exceeded',
        message:
          f.level === 'warning' ? 'notifications.budgetWarning' : 'notifications.budgetExceeded',
        vars: {
          category: cat ? categoryLabel(h.locale === 'en' ? 'en' : 'de', cat) : '?',
          percent: f.percent,
        },
        link: '/finance/budgets',
      });
    }
  }
}

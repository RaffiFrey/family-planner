import { Inject, Injectable, Logger } from '@nestjs/common';
import type { apiContract } from '@fp/contracts';
import { households, subscriptions, user } from '@fp/db';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { type In, isoOrNull, type Out } from '../../common/contract.js';
import { badRequest, unavailable } from '../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { ENV, type Env } from '../../config/env.js';
import { Db } from '../../infra/database.js';
import { entitlementsFor } from './entitlements.js';

type C = typeof apiContract.billing;
type Plan = 'free' | 'plus' | 'pro';
type Status = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface PlanChange {
  plan: Plan;
  status: Status;
  provider: 'stripe' | 'app_store' | 'play_store' | 'comp' | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

function stripeHost(env: Env): Stripe.StripeConfig {
  if (!env.STRIPE_API_BASE_URL) return {};
  const url = new URL(env.STRIPE_API_BASE_URL);
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    protocol: url.protocol === 'https:' ? 'https' : 'http',
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  readonly stripe: Stripe | null;

  constructor(
    private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, stripeHost(env)) : null;
  }

  private priceFor(plan: 'plus' | 'pro', interval: 'month' | 'year'): string | undefined {
    const map = {
      plus: { month: this.env.STRIPE_PRICE_PLUS_MONTH, year: this.env.STRIPE_PRICE_PLUS_YEAR },
      pro: { month: this.env.STRIPE_PRICE_PRO_MONTH, year: this.env.STRIPE_PRICE_PRO_YEAR },
    };
    return map[plan][interval];
  }

  planForPrice(priceId: string | undefined): Plan {
    if (!priceId) return 'free';
    if ([this.env.STRIPE_PRICE_PRO_MONTH, this.env.STRIPE_PRICE_PRO_YEAR].includes(priceId))
      return 'pro';
    if ([this.env.STRIPE_PRICE_PLUS_MONTH, this.env.STRIPE_PRICE_PLUS_YEAR].includes(priceId))
      return 'plus';
    return 'free';
  }

  async subscription(ctx: HouseholdContext): Promise<Out<C['subscription']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const [s] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.householdId, ctx.householdId));
      return {
        plan: ctx.household.plan,
        status: s?.status ?? 'none',
        provider: s?.provider ?? null,
        currentPeriodEnd: isoOrNull(s?.currentPeriodEnd ?? s?.compUntil ?? null),
        cancelAtPeriodEnd: s?.cancelAtPeriodEnd ?? false,
        entitlements: entitlementsFor(ctx.household.plan),
      };
    });
  }

  private requireStripe(): Stripe {
    if (!this.stripe) throw unavailable('Payments are not configured');
    return this.stripe;
  }

  private async customerId(ctx: HouseholdContext): Promise<string> {
    const stripe = this.requireStripe();
    const [s] = await this.db.system
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.householdId, ctx.householdId));
    if (s?.provider === 'stripe' && s.providerCustomerId) return s.providerCustomerId;
    if (s?.providerCustomerId && s.provider === null) return s.providerCustomerId;
    const [u] = await this.db.system.select().from(user).where(eq(user.id, ctx.userId));
    const customer = await stripe.customers.create({
      email: u?.email,
      name: ctx.household.name,
      metadata: { householdId: ctx.householdId },
      preferred_locales: [ctx.locale],
    });
    await this.db.system
      .insert(subscriptions)
      .values({ householdId: ctx.householdId, providerCustomerId: customer.id })
      .onConflictDoUpdate({
        target: subscriptions.householdId,
        set: { providerCustomerId: customer.id },
      });
    return customer.id;
  }

  async checkout(ctx: HouseholdContext, input: In<C['checkout']>): Promise<Out<C['checkout']>> {
    const stripe = this.requireStripe();
    const price = this.priceFor(input.body.plan, input.body.interval);
    if (!price) throw badRequest('This plan is not available', 'plan_unavailable');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: await this.customerId(ctx),
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      locale: ctx.locale,
      metadata: { householdId: ctx.householdId },
      subscription_data: { metadata: { householdId: ctx.householdId } },
      success_url: `${this.env.WEB_URL}/settings/billing?success=1`,
      cancel_url: `${this.env.WEB_URL}/settings/billing`,
    });
    if (!session.url) throw unavailable('Checkout could not be started');
    return { url: session.url };
  }

  async portal(ctx: HouseholdContext): Promise<Out<C['portal']>> {
    const stripe = this.requireStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: await this.customerId(ctx),
      return_url: `${this.env.WEB_URL}/settings/billing`,
    });
    return { url: session.url };
  }

  /** Single place where a household's plan changes (webhooks, comp grants, expiry). */
  async applyPlan(householdId: string, change: PlanChange): Promise<void> {
    await this.db.system.transaction(async (tx) => {
      const values = {
        plan: change.plan,
        status: change.status,
        provider: change.provider,
        ...(change.providerCustomerId !== undefined
          ? { providerCustomerId: change.providerCustomerId }
          : {}),
        ...(change.providerSubscriptionId !== undefined
          ? { providerSubscriptionId: change.providerSubscriptionId }
          : {}),
        ...(change.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: change.currentPeriodEnd }
          : {}),
        ...(change.cancelAtPeriodEnd !== undefined
          ? { cancelAtPeriodEnd: change.cancelAtPeriodEnd }
          : {}),
      };
      await tx
        .insert(subscriptions)
        .values({ householdId, ...values })
        .onConflictDoUpdate({ target: subscriptions.householdId, set: values });
      await tx.update(households).set({ plan: change.plan }).where(eq(households.id, householdId));
    });
    this.logger.log(
      `Household ${householdId} → ${change.plan} (${change.status}, ${change.provider ?? 'none'})`,
    );
  }

  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    if (!event.type.startsWith('customer.subscription.')) return;
    const sub = event.data.object as Stripe.Subscription;
    const householdId = sub.metadata.householdId;
    if (!householdId) return;
    const item = sub.items.data[0];
    const active =
      ['active', 'trialing', 'past_due'].includes(sub.status) &&
      event.type !== 'customer.subscription.deleted';
    const periodEnd = (item as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end;
    await this.applyPlan(householdId, {
      plan: active ? this.planForPrice(item?.price.id) : 'free',
      status: active ? (sub.status as Status) : 'canceled',
      provider: 'stripe',
      providerCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      providerSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  }

  /** RevenueCat webhook: app_user_id is the household id (set by the mobile app). */
  async handleRevenueCat(body: {
    event?: {
      type?: string;
      app_user_id?: string;
      entitlement_ids?: string[];
      expiration_at_ms?: number;
      store?: string;
    };
  }): Promise<void> {
    const e = body.event;
    if (!e?.app_user_id || !/^[0-9a-f-]{36}$/i.test(e.app_user_id)) return;
    const provider = e.store === 'PLAY_STORE' ? 'play_store' : 'app_store';
    const ids = e.entitlement_ids ?? [];
    const plan: Plan = ids.includes('pro') ? 'pro' : ids.includes('plus') ? 'plus' : 'free';
    const ended = e.type === 'EXPIRATION';
    await this.applyPlan(e.app_user_id, {
      plan: ended ? 'free' : plan,
      status: ended ? 'canceled' : e.type === 'BILLING_ISSUE' ? 'past_due' : 'active',
      provider,
      currentPeriodEnd: e.expiration_at_ms ? new Date(e.expiration_at_ms) : null,
      cancelAtPeriodEnd: e.type === 'CANCELLATION',
    });
  }
}

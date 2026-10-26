import { timingSafeEqual } from 'node:crypto';
import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { badRequest, unauthorized, unavailable } from '../../common/errors.js';
import { Household, type HouseholdContext } from '../../common/request-context.js';
import { ENV, type Env } from '../../config/env.js';
import { BillingService } from './billing.service.js';

const C = apiContract.billing;

@Controller()
export class BillingController {
  constructor(
    private readonly s: BillingService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Endpoint(C.subscription)
  subscription(@Household() ctx: HouseholdContext) {
    return this.s.subscription(ctx);
  }

  @Endpoint(C.checkout, { action: 'household.billing' })
  checkout(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.checkout>) {
    return this.s.checkout(ctx, i);
  }

  @Endpoint(C.portal, { action: 'household.billing' })
  portal(@Household() ctx: HouseholdContext) {
    return this.s.portal(ctx);
  }

  @Post('/v1/billing/webhooks/stripe')
  @HttpCode(200)
  async stripeWebhook(@Req() req: RawBodyRequest<FastifyRequest>): Promise<{ received: true }> {
    if (!this.s.stripe || !this.env.STRIPE_WEBHOOK_SECRET)
      throw unavailable('Payments are not configured');
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !req.rawBody) throw badRequest('Missing signature');
    let event;
    try {
      event = this.s.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        this.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw badRequest('Invalid signature', 'invalid_signature');
    }
    await this.s.handleStripeEvent(event);
    return { received: true };
  }

  @Post('/v1/billing/webhooks/revenuecat')
  @HttpCode(200)
  async revenueCatWebhook(@Req() req: FastifyRequest): Promise<{ received: true }> {
    const secret = this.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) throw unavailable('In-app purchases are not configured');
    const given = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthorized();
    await this.s.handleRevenueCat(req.body as Parameters<BillingService['handleRevenueCat']>[0]);
    return { received: true };
  }
}

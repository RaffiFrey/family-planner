import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { ContactsService } from './contacts.service.js';

const C = apiContract.contacts;

@Controller()
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Endpoint(C.list, { action: 'contacts.read' })
  list(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.list>) {
    return this.service.list(ctx, input);
  }

  @Endpoint(C.get, { action: 'contacts.read' })
  get(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.get>) {
    return this.service.get(ctx, input);
  }

  @Endpoint(C.create, { action: 'contacts.write' })
  create(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.create>) {
    return this.service.create(ctx, input);
  }

  @Endpoint(C.update, { action: 'contacts.write' })
  update(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.update>) {
    return this.service.update(ctx, input);
  }

  @Endpoint(C.remove, { action: 'contacts.write' })
  remove(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.remove>) {
    return this.service.remove(ctx, input);
  }

  @Endpoint(C.emergency.list, { action: 'contacts.read' })
  listCards(@Household() ctx: HouseholdContext) {
    return this.service.listCards(ctx);
  }

  @Endpoint(C.emergency.get, { action: 'contacts.read' })
  getCard(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.emergency.get>) {
    return this.service.getCard(ctx, input);
  }

  @Endpoint(C.emergency.upsert, { action: 'contacts.write' })
  upsertCard(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.emergency.upsert>) {
    return this.service.upsertCard(ctx, input);
  }

  @Endpoint(C.emergency.remove, { action: 'contacts.write' })
  removeCard(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.emergency.remove>) {
    return this.service.removeCard(ctx, input);
  }

  @Endpoint(C.emergency.summary, { action: 'contacts.read' })
  summary(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.emergency.summary>) {
    return this.service.summary(ctx, input);
  }
}

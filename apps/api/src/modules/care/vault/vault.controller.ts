import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { VaultService } from './vault.service.js';

const C = apiContract.vault;

@Controller()
export class VaultController {
  constructor(private readonly service: VaultService) {}

  @Endpoint(C.list, { action: 'vault.read' })
  list(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.list>) {
    return this.service.list(ctx, input);
  }

  @Endpoint(C.expiring, { action: 'vault.read' })
  expiring(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.expiring>) {
    return this.service.expiring(ctx, input);
  }

  @Endpoint(C.search, { action: 'vault.read' })
  search(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.search>) {
    return this.service.search(ctx, input);
  }

  @Endpoint(C.get, { action: 'vault.read' })
  get(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.get>) {
    return this.service.get(ctx, input);
  }

  @Endpoint(C.create, { action: 'vault.write' })
  create(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.create>) {
    return this.service.create(ctx, input);
  }

  @Endpoint(C.update, { action: 'vault.write' })
  update(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.update>) {
    return this.service.update(ctx, input);
  }

  @Endpoint(C.remove, { action: 'vault.write' })
  remove(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.remove>) {
    return this.service.remove(ctx, input);
  }

  @Endpoint(C.runOcr, { action: 'vault.write' })
  runOcr(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.runOcr>) {
    return this.service.runOcr(ctx, input);
  }
}

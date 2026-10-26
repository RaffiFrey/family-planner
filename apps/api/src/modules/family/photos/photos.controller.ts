import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { PhotosService } from './photos.service.js';

const C = apiContract.photos;

@Controller()
export class PhotosController {
  constructor(private readonly service: PhotosService) {}

  @Endpoint(C.list, { action: 'photos.read' })
  list(@Household() ctx: HouseholdContext) {
    return this.service.list(ctx);
  }

  @Endpoint(C.get, { action: 'photos.read' })
  get(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.get>) {
    return this.service.get(ctx, input);
  }

  @Endpoint(C.create, { action: 'photos.write' })
  create(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.create>) {
    return this.service.create(ctx, input);
  }

  @Endpoint(C.update, { action: 'photos.write' })
  update(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.update>) {
    return this.service.update(ctx, input);
  }

  @Endpoint(C.remove, { action: 'photos.write' })
  remove(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.remove>) {
    return this.service.remove(ctx, input);
  }

  @Endpoint(C.addItems, { action: 'photos.write' })
  addItems(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.addItems>) {
    return this.service.addItems(ctx, input);
  }

  @Endpoint(C.updateItem, { action: 'photos.write' })
  updateItem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateItem>) {
    return this.service.updateItem(ctx, input);
  }

  @Endpoint(C.removeItem, { action: 'photos.write' })
  removeItem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removeItem>) {
    return this.service.removeItem(ctx, input);
  }

  @Endpoint(C.reorder, { action: 'photos.write' })
  reorder(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.reorder>) {
    return this.service.reorder(ctx, input);
  }

  @Endpoint(C.memories, { action: 'photos.read' })
  memories(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.memories>) {
    return this.service.memories(ctx, input);
  }
}

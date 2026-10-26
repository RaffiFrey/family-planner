import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { MealsService } from './meals.service.js';

const C = apiContract.meals;

@Controller()
export class MealsController {
  constructor(private readonly service: MealsService) {}

  @Endpoint(C.listRecipes, { action: 'meals.read' })
  listRecipes(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.listRecipes>) {
    return this.service.listRecipes(ctx, input);
  }

  @Endpoint(C.getRecipe, { action: 'meals.read' })
  getRecipe(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.getRecipe>) {
    return this.service.getRecipe(ctx, input);
  }

  @Endpoint(C.createRecipe, { action: 'meals.write' })
  createRecipe(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.createRecipe>) {
    return this.service.createRecipe(ctx, input);
  }

  @Endpoint(C.updateRecipe, { action: 'meals.write' })
  updateRecipe(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateRecipe>) {
    return this.service.updateRecipe(ctx, input);
  }

  @Endpoint(C.removeRecipe, { action: 'meals.write' })
  removeRecipe(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removeRecipe>) {
    return this.service.removeRecipe(ctx, input);
  }

  @Endpoint(C.previewImport, { action: 'meals.write' })
  previewImport(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.previewImport>) {
    return this.service.previewImport(ctx, input);
  }

  @Endpoint(C.importRecipe, { action: 'meals.write' })
  importRecipe(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.importRecipe>) {
    return this.service.importRecipe(ctx, input);
  }

  @Endpoint(C.plan, { action: 'meals.read' })
  plan(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.plan>) {
    return this.service.plan(ctx, input);
  }

  @Endpoint(C.upsertEntry, { action: 'meals.write' })
  upsertEntry(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.upsertEntry>) {
    return this.service.upsertEntry(ctx, input);
  }

  @Endpoint(C.removeEntry, { action: 'meals.write' })
  removeEntry(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removeEntry>) {
    return this.service.removeEntry(ctx, input);
  }

  @Endpoint(C.toShoppingList, { action: 'meals.write' })
  toShoppingList(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.toShoppingList>) {
    return this.service.toShoppingList(ctx, input);
  }
}

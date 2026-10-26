import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { SchoolService } from './school.service.js';

const C = apiContract.school;

@Controller()
export class SchoolController {
  constructor(private readonly service: SchoolService) {}

  @Endpoint(C.timetable.list, { action: 'school.read' })
  list(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.timetable.list>) {
    return this.service.list(ctx, input);
  }

  @Endpoint(C.timetable.day, { action: 'school.read' })
  day(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.timetable.day>) {
    return this.service.day(ctx, input);
  }

  @Endpoint(C.timetable.create, { action: 'school.write' })
  create(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.timetable.create>) {
    return this.service.create(ctx, input);
  }

  @Endpoint(C.timetable.update, { action: 'school.write' })
  update(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.timetable.update>) {
    return this.service.update(ctx, input);
  }

  @Endpoint(C.timetable.remove, { action: 'school.write' })
  remove(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.timetable.remove>) {
    return this.service.remove(ctx, input);
  }

  @Endpoint(C.settings, { action: 'school.read' })
  settings(@Household() ctx: HouseholdContext) {
    return this.service.settings(ctx);
  }

  @Endpoint(C.updateSettings, { action: 'school.write' })
  updateSettings(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateSettings>) {
    return this.service.updateSettings(ctx, input);
  }

  @Endpoint(C.holidays, { action: 'school.read' })
  holidays(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.holidays>) {
    return this.service.holidays(ctx, input);
  }
}

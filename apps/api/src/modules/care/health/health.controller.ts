import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { HealthService } from './health.service.js';

const C = apiContract.health;

@Controller()
export class HealthRecordsController {
  constructor(private readonly service: HealthService) {}

  @Endpoint(C.vaccinations.list, { action: 'health.read' })
  listVaccinations(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.vaccinations.list>,
  ) {
    return this.service.listVaccinations(ctx, input);
  }

  @Endpoint(C.vaccinations.create, { action: 'health.write' })
  createVaccination(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.vaccinations.create>,
  ) {
    return this.service.createVaccination(ctx, input);
  }

  @Endpoint(C.vaccinations.update, { action: 'health.write' })
  updateVaccination(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.vaccinations.update>,
  ) {
    return this.service.updateVaccination(ctx, input);
  }

  @Endpoint(C.vaccinations.remove, { action: 'health.write' })
  removeVaccination(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.vaccinations.remove>,
  ) {
    return this.service.removeVaccination(ctx, input);
  }

  @Endpoint(C.medications.list, { action: 'health.read' })
  listMedications(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.medications.list>,
  ) {
    return this.service.listMedications(ctx, input);
  }

  @Endpoint(C.medications.create, { action: 'health.write' })
  createMedication(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.medications.create>,
  ) {
    return this.service.createMedication(ctx, input);
  }

  @Endpoint(C.medications.update, { action: 'health.write' })
  updateMedication(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.medications.update>,
  ) {
    return this.service.updateMedication(ctx, input);
  }

  @Endpoint(C.medications.remove, { action: 'health.write' })
  removeMedication(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.medications.remove>,
  ) {
    return this.service.removeMedication(ctx, input);
  }

  @Endpoint(C.medications.schedule, { action: 'health.read' })
  medicationSchedule(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.medications.schedule>,
  ) {
    return this.service.medicationSchedule(ctx, input);
  }

  @Endpoint(C.checkups.list, { action: 'health.read' })
  listCheckups(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.checkups.list>) {
    return this.service.listCheckups(ctx, input);
  }

  @Endpoint(C.checkups.markDone, { action: 'health.write' })
  markCheckup(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.checkups.markDone>) {
    return this.service.markCheckup(ctx, input);
  }

  @Endpoint(C.checkups.unmark, { action: 'health.write' })
  unmarkCheckup(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.checkups.unmark>) {
    return this.service.unmarkCheckup(ctx, input);
  }
}

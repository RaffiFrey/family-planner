import { Module } from '@nestjs/common';
import { FamilyJobs } from './family.jobs.js';
import { MealsController } from './meals/meals.controller.js';
import { MealsService } from './meals/meals.service.js';
import { RecipeFetcher } from './meals/recipe-fetcher.js';
import { PhotosController } from './photos/photos.controller.js';
import { PhotosService } from './photos/photos.service.js';
import { PinboardController } from './pinboard/pinboard.controller.js';
import { PinboardService } from './pinboard/pinboard.service.js';
import { RewardsController } from './rewards/rewards.controller.js';
import { RewardsService } from './rewards/rewards.service.js';
import { TravelController } from './travel/travel.controller.js';
import { TravelService } from './travel/travel.service.js';

/** Family life: meals & recipes, rewards & pocket money, pinboard & polls, travel, photos. */
@Module({
  controllers: [
    MealsController,
    RewardsController,
    PinboardController,
    TravelController,
    PhotosController,
  ],
  providers: [
    RecipeFetcher,
    MealsService,
    RewardsService,
    PinboardService,
    TravelService,
    PhotosService,
    FamilyJobs,
  ],
  exports: [RewardsService, TravelService, RecipeFetcher],
})
export class FamilyModule {}

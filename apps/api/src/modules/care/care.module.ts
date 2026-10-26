import { Module } from '@nestjs/common';
import { CareJobs } from './care.jobs.js';
import { ContactsController } from './contacts/contacts.controller.js';
import { ContactsService } from './contacts/contacts.service.js';
import { HealthRecordsController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { HomeController } from './home/home.controller.js';
import { HomeService } from './home/home.service.js';
import { LocationController } from './location/location.controller.js';
import { LocationService } from './location/location.service.js';
import { HolidayFetcher } from './school/holiday-fetcher.js';
import { SchoolController } from './school/school.controller.js';
import { SchoolService } from './school/school.service.js';
import { OcrEngine } from './vault/ocr-engine.js';
import { VaultController } from './vault/vault.controller.js';
import { VaultService } from './vault/vault.service.js';

/**
 * Documents vault + OCR, contacts & emergency cards, health, kids & school,
 * home & vehicles (P2) and location sharing (P3).
 */
@Module({
  controllers: [
    VaultController,
    ContactsController,
    HealthRecordsController,
    SchoolController,
    HomeController,
    LocationController,
  ],
  providers: [
    OcrEngine,
    VaultService,
    ContactsService,
    HealthService,
    HolidayFetcher,
    SchoolService,
    HomeService,
    LocationService,
    CareJobs,
  ],
  exports: [VaultService, HealthService, HomeService, LocationService, SchoolService],
})
export class CareModule {}

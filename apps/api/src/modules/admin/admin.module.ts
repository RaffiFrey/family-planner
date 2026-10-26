import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { StaffGuard } from './staff.guard.js';

@Module({ controllers: [AdminController], providers: [AdminService, StaffGuard] })
export class AdminModule {}

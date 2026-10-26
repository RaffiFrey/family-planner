import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { Household, type HouseholdContext } from '../../common/request-context.js';
import { StorageService } from './storage.service.js';

const C = apiContract.storage;

@Controller()
export class StorageController {
  constructor(private readonly s: StorageService) {}

  @Endpoint(C.browse, { action: 'storage.read' })
  browse(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.browse>) {
    return this.s.browse(ctx, i);
  }

  @Endpoint(C.createFolder, { action: 'storage.write' })
  createFolder(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createFolder>) {
    return this.s.createFolder(ctx, i);
  }

  @Endpoint(C.updateFolder, { action: 'storage.write' })
  updateFolder(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.updateFolder>) {
    return this.s.updateFolder(ctx, i);
  }

  @Endpoint(C.deleteFolder, { action: 'storage.write' })
  deleteFolder(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteFolder>) {
    return this.s.deleteFolder(ctx, i);
  }

  @Endpoint(C.createUpload, { action: 'storage.write' })
  createUpload(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createUpload>) {
    return this.s.createUpload(ctx, i);
  }

  @Endpoint(C.completeUpload, { action: 'storage.write' })
  completeUpload(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.completeUpload>) {
    return this.s.completeUpload(ctx, i);
  }

  @Endpoint(C.getFile, { action: 'storage.read' })
  getFile(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.getFile>) {
    return this.s.getFile(ctx, i);
  }

  @Endpoint(C.updateFile, { action: 'storage.write' })
  updateFile(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.updateFile>) {
    return this.s.updateFile(ctx, i);
  }

  @Endpoint(C.deleteFile, { action: 'storage.write' })
  deleteFile(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteFile>) {
    return this.s.deleteFile(ctx, i);
  }

  @Endpoint(C.download, { action: 'storage.read' })
  download(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.download>) {
    return this.s.download(ctx, i);
  }

  @Endpoint(C.usage, { action: 'storage.read' })
  usage(@Household() ctx: HouseholdContext) {
    return this.s.usage(ctx);
  }
}

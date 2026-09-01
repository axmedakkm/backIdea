import { Global, Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';

/** Global so any feature module can store images without re-importing. */
@Global()
@Module({
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}

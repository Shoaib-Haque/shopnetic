import { Global, Module } from '@nestjs/common';
import { JwksService } from './jwks.service.js';
import { JwksController } from './jwks.controller.js';
import { SecretBoxService } from './secret-box.service.js';

@Global()
@Module({
  controllers: [JwksController],
  providers: [JwksService, SecretBoxService],
  exports: [JwksService, SecretBoxService],
})
export class CryptoModule {}

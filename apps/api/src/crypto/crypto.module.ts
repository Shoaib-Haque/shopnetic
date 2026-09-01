import { Global, Module } from '@nestjs/common';
import { JwksService } from './jwks.service.js';
import { JwksController } from './jwks.controller.js';

@Global()
@Module({
  controllers: [JwksController],
  providers: [JwksService],
  exports: [JwksService],
})
export class CryptoModule {}

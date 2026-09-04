import { Controller, Get, Header } from '@nestjs/common';
import type { JWK } from 'jose';
import { JwksService } from './jwks.service.js';

@Controller()
export class JwksController {
  constructor(private readonly jwks: JwksService) {}

  /** Public keys for verifying access tokens (plan/16 section 1). */
  @Get('.well-known/jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  keys(): { keys: JWK[] } {
    return this.jwks.jwks();
  }
}

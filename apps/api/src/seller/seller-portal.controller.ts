import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from '@shopnetic/auth';
import {
  createSellerRequestSchema,
  updateMyShopRequestSchema,
  type CheckShopSlugResponse,
  type CreateSellerRequest,
  type SellerWithShop,
  type UpdateMyShopRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { requestMeta as meta } from '../common/request-meta.js';
import { SellerService } from './seller.service.js';

const createBody = new ZodBodyPipe(createSellerRequestSchema);
const updateMyShopBody = new ZodBodyPipe(updateMyShopRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string } };

@Controller('seller/v1')
@UseGuards(AuthGuard)
export class SellerPortalController {
  constructor(private readonly sellers: SellerService) {}

  @Get('me')
  async getMySeller(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
  ): Promise<Envelope<SellerWithShop | null>> {
    const seller = await this.sellers.getByAccountId(actor.accountId);
    return ok(req, seller);
  }

  @Get('shops/check-slug')
  async checkSlug(
    @Req() req: Request,
    @Query('slug') slug?: string,
  ): Promise<Envelope<CheckShopSlugResponse>> {
    const trimmedSlug = (slug ?? '').trim().toLowerCase();
    if (!trimmedSlug) {
      return ok(req, { slug: '', available: false });
    }
    const available = await this.sellers.isSlugAvailable(trimmedSlug);
    return ok(req, { slug: trimmedSlug, available });
  }

  @Post('register')
  @HttpCode(201)
  async register(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createBody) body: CreateSellerRequest,
  ): Promise<Envelope<SellerWithShop>> {
    const seller = await this.sellers.registerSelf(body, actor, meta(req));
    return ok(req, seller);
  }

  @Post('resubmit')
  @HttpCode(200)
  async resubmit(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createBody) body: CreateSellerRequest,
  ): Promise<Envelope<SellerWithShop>> {
    const seller = await this.sellers.resubmitSelf(body, actor, meta(req));
    return ok(req, seller);
  }

  @Patch('me/shop')
  async updateMyShop(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(updateMyShopBody) body: UpdateMyShopRequest,
  ): Promise<Envelope<SellerWithShop>> {
    const seller = await this.sellers.updateMyShop(actor, body, meta(req));
    return ok(req, seller);
  }
}

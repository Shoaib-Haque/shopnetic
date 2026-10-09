import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission, type Actor } from '@shopnetic/auth';
import {
  createSellerRequestSchema,
  updateSellerStatusRequestSchema,
  type CreateSellerRequest,
  type SellerStatus,
  type SellerWithShop,
  type UpdateSellerStatusRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { requestMeta as meta } from '../common/request-meta.js';
import { SellerService } from './seller.service.js';
import { AppError } from '../common/app-error.js';

const createBody = new ZodBodyPipe(createSellerRequestSchema);
const updateStatusBody = new ZodBodyPipe(updateSellerStatusRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; nextCursor?: string; count?: number } };

@Controller('admin/v1/sellers')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.SELLER_APPROVE)
export class AdminSellerController {
  constructor(private readonly sellers: SellerService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Envelope<SellerWithShop[]>> {
    const opts: Parameters<SellerService['list']>[0] = {};
    if (status) opts.status = status as SellerStatus;
    if (cursor) opts.cursor = cursor;
    if (limit) opts.limit = Number(limit);

    const { items, nextCursor } = await this.sellers.list(opts);
    const base = ok(req, items);
    return {
      data: base.data,
      meta: { ...base.meta, count: items.length, ...(nextCursor ? { nextCursor } : {}) },
    };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<SellerWithShop>> {
    return ok(req, await this.sellers.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createBody) body: CreateSellerRequest,
  ): Promise<Envelope<SellerWithShop>> {
    return ok(req, await this.sellers.create(body, actor, meta(req)));
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateStatusBody) body: UpdateSellerStatusRequest,
  ): Promise<Envelope<SellerWithShop>> {
    return ok(req, await this.sellers.updateStatus(id, body, actor, meta(req)));
  }
}

@Controller('catalog/shops')
export class PublicShopController {
  constructor(private readonly sellers: SellerService) {}

  @Get(':slug')
  async getBySlug(
    @Req() req: Request,
    @Param('slug') slug: string,
  ): Promise<Envelope<SellerWithShop>> {
    const seller = await this.sellers.getByShopSlug(slug);
    if (!seller) {
      throw new AppError('SELLER_NOT_FOUND', 404, { detail: `shop '${slug}' not found` });
    }
    return ok(req, seller);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission, type Actor } from '@shopnetic/auth';
import {
  createVariantRequestSchema,
  updateVariantRequestSchema,
  type CreateVariantRequest,
  type UpdateVariantRequest,
  type Variant,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { VariantService } from './variant.service.js';

const createBody = new ZodBodyPipe(createVariantRequestSchema);
const updateBody = new ZodBodyPipe(updateVariantRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; count?: number } };

@Controller('admin/v1/products/:productId/variants')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.PRODUCT_MANAGE)
export class VariantController {
  constructor(private readonly variants: VariantService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Param('productId') productId: string,
  ): Promise<Envelope<Variant[]>> {
    const items = await this.variants.list(productId);
    const base = ok(req, items);
    return { data: base.data, meta: { ...base.meta, count: items.length } };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<Variant>> {
    return ok(req, await this.variants.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('productId') productId: string,
    @Body(createBody) body: CreateVariantRequest,
  ): Promise<Envelope<Variant>> {
    return ok(req, await this.variants.create(productId, body, actor, meta(req)));
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateBody) body: UpdateVariantRequest,
  ): Promise<Envelope<Variant>> {
    return ok(req, await this.variants.update(id, body, actor, meta(req)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.variants.remove(id, actor, meta(req));
  }
}

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

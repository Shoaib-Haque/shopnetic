import {
  Body,
  Controller,
  Delete,
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
  addBrandAliasRequestSchema,
  createBrandRequestSchema,
  mergeBrandRequestSchema,
  updateBrandRequestSchema,
  type AddBrandAliasRequest,
  type Brand,
  type CreateBrandRequest,
  type MergeBrandRequest,
  type UpdateBrandRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { BrandService } from './brand.service.js';

const createBody = new ZodBodyPipe(createBrandRequestSchema);
const updateBody = new ZodBodyPipe(updateBrandRequestSchema);
const aliasBody = new ZodBodyPipe(addBrandAliasRequestSchema);
const mergeBody = new ZodBodyPipe(mergeBrandRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; nextCursor?: string; count?: number } };

@Controller('admin/v1/brands')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.BRAND_MANAGE)
export class BrandController {
  constructor(private readonly brands: BrandService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Envelope<Brand[]>> {
    const opts: Parameters<BrandService['list']>[0] = {};
    if (status === 'pending' || status === 'active' || status === 'rejected') opts.status = status;
    if (q) opts.q = q;
    if (cursor) opts.cursor = cursor;
    if (limit) opts.limit = Number(limit);

    const { items, nextCursor } = await this.brands.list(opts);
    const base = ok(req, items);
    return {
      data: base.data,
      meta: { ...base.meta, count: items.length, ...(nextCursor ? { nextCursor } : {}) },
    };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<Brand>> {
    return ok(req, await this.brands.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createBody) body: CreateBrandRequest,
  ): Promise<Envelope<Brand>> {
    return ok(req, await this.brands.create(body, actor, meta(req)));
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateBody) body: UpdateBrandRequest,
  ): Promise<Envelope<Brand>> {
    return ok(req, await this.brands.update(id, body, actor, meta(req)));
  }

  @Post(':id/aliases')
  @HttpCode(201)
  async addAlias(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(aliasBody) body: AddBrandAliasRequest,
  ): Promise<Envelope<Brand>> {
    return ok(req, await this.brands.addAlias(id, body, actor, meta(req)));
  }

  @Delete(':id/aliases/:aliasId')
  @HttpCode(204)
  async removeAlias(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
  ): Promise<void> {
    await this.brands.removeAlias(id, aliasId, actor, meta(req));
  }

  @Post(':id/merge')
  async merge(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(mergeBody) body: MergeBrandRequest,
  ): Promise<Envelope<Brand>> {
    return ok(req, await this.brands.merge(id, body, actor, meta(req)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.brands.remove(id, actor, meta(req));
  }
}

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

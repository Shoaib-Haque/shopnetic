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
  createProductRequestSchema,
  updateProductRequestSchema,
  type CreateProductRequest,
  type Product,
  type UpdateProductRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { ProductService } from './product.service.js';

const createBody = new ZodBodyPipe(createProductRequestSchema);
const updateBody = new ZodBodyPipe(updateProductRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; nextCursor?: string; count?: number } };

@Controller('admin/v1/products')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.PRODUCT_MANAGE)
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Envelope<Product[]>> {
    const opts: Parameters<ProductService['list']>[0] = {};
    if (categoryId) opts.categoryId = categoryId;
    if (brandId) opts.brandId = brandId;
    if (
      status === 'draft' ||
      status === 'pending' ||
      status === 'active' ||
      status === 'archived'
    ) {
      opts.status = status;
    }
    if (q) opts.q = q;
    if (cursor) opts.cursor = cursor;
    if (limit) opts.limit = Number(limit);

    const { items, nextCursor } = await this.products.list(opts);
    const base = ok(req, items);
    return {
      data: base.data,
      meta: { ...base.meta, count: items.length, ...(nextCursor ? { nextCursor } : {}) },
    };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<Product>> {
    return ok(req, await this.products.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createBody) body: CreateProductRequest,
  ): Promise<Envelope<Product>> {
    return ok(req, await this.products.create(body, actor, meta(req)));
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateBody) body: UpdateProductRequest,
  ): Promise<Envelope<Product>> {
    return ok(req, await this.products.update(id, body, actor, meta(req)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.products.remove(id, actor, meta(req));
  }
}

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

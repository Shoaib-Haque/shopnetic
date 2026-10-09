import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission, type Actor } from '@shopnetic/auth';
import {
  createOfferRequestSchema,
  createWarehouseRequestSchema,
  listOffersQuerySchema,
  updateOfferRequestSchema,
  updateStockRequestSchema,
  type Buybox,
  type CreateOfferRequest,
  type CreateWarehouseRequest,
  type Offer,
  type StockLevel,
  type UpdateOfferRequest,
  type UpdateStockRequest,
  type Warehouse,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { requestMeta as meta } from '../common/request-meta.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppError } from '../common/app-error.js';
import { OfferService } from './offer.service.js';
import { StockService } from './stock.service.js';
import { WarehouseService } from './warehouse.service.js';
import { BuyboxService } from './buybox.service.js';

const createOfferBody = new ZodBodyPipe(createOfferRequestSchema);
const updateOfferBody = new ZodBodyPipe(updateOfferRequestSchema);
const updateStockBody = new ZodBodyPipe(updateStockRequestSchema);
const createWarehouseBody = new ZodBodyPipe(createWarehouseRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; nextCursor?: string; count?: number } };

@Controller('admin/v1/offers')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.OFFER_MANAGE)
export class AdminOfferController {
  constructor(
    private readonly offers: OfferService,
    private readonly stock: StockService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveSellerId(requestedSellerId?: string): Promise<string> {
    if (requestedSellerId) return requestedSellerId;
    const defaultSeller = await this.prisma.seller.findFirst({
      where: { shop: { slug: 'shopnetic-retail' }, deletedAt: null },
    });
    if (!defaultSeller) {
      const anySeller = await this.prisma.seller.findFirst({
        where: { deletedAt: null },
      });
      if (!anySeller) throw new AppError('SELLER_NOT_FOUND', 404, { detail: 'no seller found' });
      return anySeller.id;
    }
    return defaultSeller.id;
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('variantId') variantId?: string,
    @Query('sellerId') sellerId?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Envelope<Offer[]>> {
    const rawQuery: Record<string, unknown> = {};
    if (variantId) rawQuery.variantId = variantId;
    if (sellerId) rawQuery.sellerId = sellerId;
    if (status) rawQuery.status = status;
    if (cursor) rawQuery.cursor = cursor;
    if (limit) rawQuery.limit = limit;

    const parsed = listOffersQuerySchema.parse(rawQuery);
    const { items, nextCursor } = await this.offers.list(parsed);
    const base = ok(req, items);
    return {
      data: base.data,
      meta: { ...base.meta, count: items.length, ...(nextCursor ? { nextCursor } : {}) },
    };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<Offer>> {
    return ok(req, await this.offers.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createOfferBody) body: CreateOfferRequest,
  ): Promise<Envelope<Offer>> {
    const sellerId = await this.resolveSellerId(body.sellerId);
    return ok(req, await this.offers.create(sellerId, body, actor, meta(req)));
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateOfferBody) body: UpdateOfferRequest,
  ): Promise<Envelope<Offer>> {
    return ok(req, await this.offers.update(id, body, actor, meta(req)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.offers.remove(id, actor, meta(req));
  }

  @Put(':id/stock/:warehouseId')
  async updateStock(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('warehouseId') warehouseId: string,
    @Body(updateStockBody) body: UpdateStockRequest,
  ): Promise<Envelope<StockLevel>> {
    return ok(req, await this.stock.update(id, warehouseId, body, actor, meta(req)));
  }
}

@Controller('admin/v1/warehouses')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.INVENTORY_MANAGE)
export class AdminWarehouseController {
  constructor(
    private readonly warehouses: WarehouseService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveSellerId(requestedSellerId?: string): Promise<string> {
    if (requestedSellerId) return requestedSellerId;
    const defaultSeller = await this.prisma.seller.findFirst({
      where: { shop: { slug: 'shopnetic-retail' }, deletedAt: null },
    });
    if (!defaultSeller) {
      const anySeller = await this.prisma.seller.findFirst({
        where: { deletedAt: null },
      });
      if (!anySeller) throw new AppError('SELLER_NOT_FOUND', 404, { detail: 'no seller found' });
      return anySeller.id;
    }
    return defaultSeller.id;
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('sellerId') requestedSellerId?: string,
  ): Promise<Envelope<Warehouse[]>> {
    const sellerId = await this.resolveSellerId(requestedSellerId);
    return ok(req, await this.warehouses.list(sellerId));
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<Warehouse>> {
    return ok(req, await this.warehouses.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createWarehouseBody) body: CreateWarehouseRequest,
  ): Promise<Envelope<Warehouse>> {
    const sellerId = await this.resolveSellerId(body.sellerId);
    return ok(req, await this.warehouses.create(sellerId, body, actor, meta(req)));
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: Partial<CreateWarehouseRequest>,
  ): Promise<Envelope<Warehouse>> {
    return ok(req, await this.warehouses.update(id, body, actor, meta(req)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.warehouses.remove(id, actor, meta(req));
  }
}

@Controller('catalog')
export class PublicCatalogOfferController {
  constructor(
    private readonly offers: OfferService,
    private readonly buybox: BuyboxService,
  ) {}

  @Get('variants/:variantId/buybox')
  async getBuybox(
    @Req() req: Request,
    @Param('variantId') variantId: string,
  ): Promise<Envelope<Buybox | null>> {
    const res = await this.buybox.get(variantId);
    return ok(req, res);
  }

  @Get('variants/:variantId/offers')
  async listVariantOffers(
    @Req() req: Request,
    @Param('variantId') variantId: string,
  ): Promise<Envelope<Offer[]>> {
    const items = await this.offers.listByVariant(variantId);
    return ok(req, items);
  }

  @Get('products/:productId/offers')
  async listProductOffers(
    @Req() req: Request,
    @Param('productId') productId: string,
  ): Promise<Envelope<Offer[]>> {
    const items = await this.offers.listByProduct(productId);
    return ok(req, items);
  }
}

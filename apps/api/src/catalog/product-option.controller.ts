import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission, type Actor } from '@shopnetic/auth';
import {
  putProductOptionRequestSchema,
  setProductOptionValuesRequestSchema,
  type ProductOption,
  type PutProductOptionRequest,
  type SetProductOptionValuesRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { ProductOptionService } from './product-option.service.js';

const putBody = new ZodBodyPipe(putProductOptionRequestSchema);
const valuesBody = new ZodBodyPipe(setProductOptionValuesRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; count?: number } };

@Controller('admin/v1/products/:productId/options')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.PRODUCT_MANAGE)
export class ProductOptionController {
  constructor(private readonly productOptions: ProductOptionService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Param('productId') productId: string,
  ): Promise<Envelope<ProductOption[]>> {
    const items = await this.productOptions.list(productId);
    const base = ok(req, items);
    return { data: base.data, meta: { ...base.meta, count: items.length } };
  }

  @Put(':optionTypeId')
  async put(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('productId') productId: string,
    @Param('optionTypeId') optionTypeId: string,
    @Body(putBody) body: PutProductOptionRequest,
  ): Promise<Envelope<ProductOption>> {
    return ok(req, await this.productOptions.put(productId, optionTypeId, body, actor, meta(req)));
  }

  @Put(':optionTypeId/values')
  async setValues(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('productId') productId: string,
    @Param('optionTypeId') optionTypeId: string,
    @Body(valuesBody) body: SetProductOptionValuesRequest,
  ): Promise<Envelope<ProductOption>> {
    return ok(
      req,
      await this.productOptions.setValues(productId, optionTypeId, body, actor, meta(req)),
    );
  }

  @Delete(':optionTypeId')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('productId') productId: string,
    @Param('optionTypeId') optionTypeId: string,
  ): Promise<void> {
    await this.productOptions.remove(productId, optionTypeId, actor, meta(req));
  }
}

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

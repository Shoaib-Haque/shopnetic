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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission, type Actor } from '@shopnetic/auth';
import {
  createMediaRequestSchema,
  putMediaTagRequestSchema,
  updateMediaRequestSchema,
  type CreateMediaRequest,
  type MediaAsset,
  type PutMediaTagRequest,
  type UpdateMediaRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { MediaService } from './media.service.js';

const createBody = new ZodBodyPipe(createMediaRequestSchema);
const updateBody = new ZodBodyPipe(updateMediaRequestSchema);
const tagBody = new ZodBodyPipe(putMediaTagRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; count?: number } };

@Controller('admin/v1')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.PRODUCT_MANAGE)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('products/:productId/media')
  async listForProduct(
    @Req() req: Request,
    @Param('productId') productId: string,
  ): Promise<Envelope<MediaAsset[]>> {
    const items = await this.media.listForOwner('product', productId);
    const base = ok(req, items);
    return { data: base.data, meta: { ...base.meta, count: items.length } };
  }

  @Post('products/:productId/media')
  @HttpCode(201)
  async createForProduct(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('productId') productId: string,
    @Body(createBody) body: CreateMediaRequest,
  ): Promise<Envelope<MediaAsset>> {
    return ok(req, await this.media.create('product', productId, body, actor, meta(req)));
  }

  @Get('media/:id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<MediaAsset>> {
    return ok(req, await this.media.get(id));
  }

  @Patch('media/:id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateBody) body: UpdateMediaRequest,
  ): Promise<Envelope<MediaAsset>> {
    return ok(req, await this.media.update(id, body, actor, meta(req)));
  }

  @Delete('media/:id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.media.remove(id, actor, meta(req));
  }

  @Put('media/:id/tags/:optionTypeId')
  async putTag(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('optionTypeId') optionTypeId: string,
    @Body(tagBody) body: PutMediaTagRequest,
  ): Promise<Envelope<MediaAsset>> {
    return ok(req, await this.media.putTag(id, optionTypeId, body.optionValueId, actor, meta(req)));
  }

  @Delete('media/:id/tags/:optionTypeId')
  @HttpCode(204)
  async removeTag(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('optionTypeId') optionTypeId: string,
  ): Promise<void> {
    await this.media.removeTag(id, optionTypeId, actor, meta(req));
  }
}

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

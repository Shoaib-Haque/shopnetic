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
  addValueSetItemRequestSchema,
  createValueSetRequestSchema,
  reorderValueSetItemsRequestSchema,
  updateValueSetRequestSchema,
  valueSetListStatusSchema,
  type AddValueSetItemRequest,
  type CreateValueSetRequest,
  type ReorderValueSetItemsRequest,
  type UpdateValueSetRequest,
  type ValueSet,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { requestMeta as meta } from '../common/request-meta.js';
import { ValueSetService } from './value-set.service.js';

const createBody = new ZodBodyPipe(createValueSetRequestSchema);
const updateBody = new ZodBodyPipe(updateValueSetRequestSchema);
const itemBody = new ZodBodyPipe(addValueSetItemRequestSchema);
const reorderBody = new ZodBodyPipe(reorderValueSetItemsRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; count?: number } };

@Controller('admin/v1/value-sets')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.ATTRIBUTE_MANAGE)
export class ValueSetController {
  constructor(private readonly valueSets: ValueSetService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('optionTypeId') optionTypeId?: string,
    @Query('q') q?: string,
  ): Promise<Envelope<ValueSet[]>> {
    const parsedStatus = valueSetListStatusSchema.safeParse(status).data ?? 'active';
    const items = await this.valueSets.list({
      status: parsedStatus,
      ...(optionTypeId ? { optionTypeId } : {}),
      ...(q ? { q } : {}),
    });
    const base = ok(req, items);
    return { data: base.data, meta: { ...base.meta, count: items.length } };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<ValueSet>> {
    return ok(req, await this.valueSets.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createBody) body: CreateValueSetRequest,
  ): Promise<Envelope<ValueSet>> {
    return ok(req, await this.valueSets.create(body, actor, meta(req)));
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateBody) body: UpdateValueSetRequest,
  ): Promise<Envelope<ValueSet>> {
    return ok(req, await this.valueSets.update(id, body, actor, meta(req)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.valueSets.remove(id, actor, meta(req));
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<Envelope<ValueSet>> {
    return ok(req, await this.valueSets.restore(id, actor, meta(req)));
  }

  @Post(':id/items')
  @HttpCode(201)
  async addItem(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(itemBody) body: AddValueSetItemRequest,
  ): Promise<Envelope<ValueSet>> {
    return ok(req, await this.valueSets.addItem(id, body, actor, meta(req)));
  }

  @Post(':id/items/reorder')
  @HttpCode(200)
  async reorderItems(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(reorderBody) body: ReorderValueSetItemsRequest,
  ): Promise<Envelope<ValueSet>> {
    return ok(req, await this.valueSets.reorderItems(id, body, actor, meta(req)));
  }

  @Delete(':id/items/:optionValueId')
  @HttpCode(204)
  async removeItem(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('optionValueId') optionValueId: string,
  ): Promise<void> {
    await this.valueSets.removeItem(id, optionValueId, actor, meta(req));
  }
}

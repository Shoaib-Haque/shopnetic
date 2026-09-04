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
  addValueSetItemRequestSchema,
  createValueSetRequestSchema,
  updateValueSetRequestSchema,
  type AddValueSetItemRequest,
  type CreateValueSetRequest,
  type UpdateValueSetRequest,
  type ValueSet,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { ValueSetService } from './value-set.service.js';

const createBody = new ZodBodyPipe(createValueSetRequestSchema);
const updateBody = new ZodBodyPipe(updateValueSetRequestSchema);
const itemBody = new ZodBodyPipe(addValueSetItemRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; count?: number } };

@Controller('admin/v1/value-sets')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.ATTRIBUTE_MANAGE)
export class ValueSetController {
  constructor(private readonly valueSets: ValueSetService) {}

  @Get()
  async list(@Req() req: Request): Promise<Envelope<ValueSet[]>> {
    const items = await this.valueSets.list();
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

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

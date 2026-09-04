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
  addOptionValueRequestSchema,
  createOptionTypeRequestSchema,
  updateOptionTypeRequestSchema,
  updateOptionValueRequestSchema,
  type AddOptionValueRequest,
  type CreateOptionTypeRequest,
  type OptionType,
  type UpdateOptionTypeRequest,
  type UpdateOptionValueRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { OptionTypeService } from './option-type.service.js';

const createBody = new ZodBodyPipe(createOptionTypeRequestSchema);
const updateBody = new ZodBodyPipe(updateOptionTypeRequestSchema);
const addValueBody = new ZodBodyPipe(addOptionValueRequestSchema);
const updateValueBody = new ZodBodyPipe(updateOptionValueRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; count?: number } };

@Controller('admin/v1/option-types')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.ATTRIBUTE_MANAGE)
export class OptionTypeController {
  constructor(private readonly optionTypes: OptionTypeService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<Envelope<OptionType[]>> {
    const opts: Parameters<OptionTypeService['list']>[0] = {
      includeDeleted: includeDeleted === 'true',
    };
    if (status === 'active' || status === 'deprecated') opts.status = status;
    if (q) opts.q = q;

    const items = await this.optionTypes.list(opts);
    const base = ok(req, items);
    return { data: base.data, meta: { ...base.meta, count: items.length } };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<OptionType>> {
    return ok(req, await this.optionTypes.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createBody) body: CreateOptionTypeRequest,
  ): Promise<Envelope<OptionType>> {
    return ok(req, await this.optionTypes.create(body, actor, meta(req)));
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateBody) body: UpdateOptionTypeRequest,
  ): Promise<Envelope<OptionType>> {
    return ok(req, await this.optionTypes.update(id, body, actor, meta(req)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.optionTypes.remove(id, actor, meta(req));
  }

  @Post(':id/values')
  @HttpCode(201)
  async addValue(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(addValueBody) body: AddOptionValueRequest,
  ): Promise<Envelope<OptionType>> {
    return ok(req, await this.optionTypes.addValue(id, body, actor, meta(req)));
  }

  @Patch(':id/values/:valueId')
  async updateValue(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('valueId') valueId: string,
    @Body(updateValueBody) body: UpdateOptionValueRequest,
  ): Promise<Envelope<OptionType>> {
    return ok(req, await this.optionTypes.updateValue(id, valueId, body, actor, meta(req)));
  }

  @Delete(':id/values/:valueId')
  @HttpCode(204)
  async removeValue(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('valueId') valueId: string,
  ): Promise<void> {
    await this.optionTypes.removeValue(id, valueId, actor, meta(req));
  }
}

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

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
  putCategoryOptionRequestSchema,
  type CategoryOption,
  type PutCategoryOptionRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { CategoryOptionService } from './category-option.service.js';

const putBody = new ZodBodyPipe(putCategoryOptionRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string; count?: number } };

@Controller('admin/v1/categories/:categoryId/options')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.CATEGORY_MANAGE)
export class CategoryOptionController {
  constructor(private readonly categoryOptions: CategoryOptionService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Param('categoryId') categoryId: string,
  ): Promise<Envelope<CategoryOption[]>> {
    const items = await this.categoryOptions.list(categoryId);
    const base = ok(req, items);
    return { data: base.data, meta: { ...base.meta, count: items.length } };
  }

  @Put(':optionTypeId')
  async put(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('categoryId') categoryId: string,
    @Param('optionTypeId') optionTypeId: string,
    @Body(putBody) body: PutCategoryOptionRequest,
  ): Promise<Envelope<CategoryOption>> {
    return ok(
      req,
      await this.categoryOptions.put(categoryId, optionTypeId, body, actor, meta(req)),
    );
  }

  @Delete(':optionTypeId')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('categoryId') categoryId: string,
    @Param('optionTypeId') optionTypeId: string,
  ): Promise<void> {
    await this.categoryOptions.remove(categoryId, optionTypeId, actor, meta(req));
  }
}

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

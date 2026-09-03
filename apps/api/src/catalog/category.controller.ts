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
  createCategoryRequestSchema,
  moveCategoryRequestSchema,
  updateCategoryRequestSchema,
  type Category,
  type CreateCategoryRequest,
  type MoveCategoryRequest,
  type UpdateCategoryRequest,
} from '@shopnetic/contracts';
import { ok } from '../common/envelope.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { CategoryService } from './category.service.js';

const createBody = new ZodBodyPipe(createCategoryRequestSchema);
const updateBody = new ZodBodyPipe(updateCategoryRequestSchema);
const moveBody = new ZodBodyPipe(moveCategoryRequestSchema);

type Envelope<T> = { data: T; meta: { requestId: string } };

@Controller('admin/v1/categories')
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(Permission.CATEGORY_MANAGE)
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('parentId') parentId?: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<Envelope<Category[]>> {
    const opts: { parentId?: string | null; includeInactive?: boolean } = {
      includeInactive: includeInactive === 'true',
    };
    if (parentId === 'null') opts.parentId = null;
    else if (parentId) opts.parentId = parentId;
    return ok(req, await this.categories.list(opts));
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<Envelope<Category>> {
    return ok(req, await this.categories.get(id));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(createBody) body: CreateCategoryRequest,
  ): Promise<Envelope<Category>> {
    return ok(req, await this.categories.create(body, actor, meta(req)));
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(updateBody) body: UpdateCategoryRequest,
  ): Promise<Envelope<Category>> {
    return ok(req, await this.categories.update(id, body, actor, meta(req)));
  }

  @Post(':id/move')
  async move(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(moveBody) body: MoveCategoryRequest,
  ): Promise<Envelope<Category>> {
    return ok(req, await this.categories.move(id, body, actor, meta(req)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.categories.remove(id, actor, meta(req));
  }
}

function meta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}

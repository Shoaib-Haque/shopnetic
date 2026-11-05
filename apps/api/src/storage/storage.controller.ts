import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '@shopnetic/auth';
import {
  requestUploadUrlSchema,
  type RequestUploadUrlRequest,
  type UploadUrlResponse,
} from '@shopnetic/contracts';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { ok } from '../common/envelope.js';
import { StorageService } from './storage.service.js';

const uploadUrlBody = new ZodBodyPipe(requestUploadUrlSchema);

@Controller('admin/v1')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('media/upload-url')
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  async getUploadUrl(
    @Req() req: Request,
    @Body(uploadUrlBody) body: RequestUploadUrlRequest,
  ): Promise<{ data: UploadUrlResponse; meta: { requestId: string } }> {
    const res = await this.storage.createUploadUrl(body);
    return ok(req, res);
  }

  /**
   * Local dev upload handler for binary PUT requests generated via `createUploadUrl`.
   * Authenticated via HMAC signature query parameters (mirrors S3 presigned URL semantics).
   */
  @Put('storage/upload')
  @HttpCode(200)
  async uploadLocal(
    @Req() req: Request,
    @Query('key') key?: string,
    @Query('token') token?: string,
    @Query('expires') expiresStr?: string,
  ): Promise<{ status: string }> {
    if (!key || !token || !expiresStr) {
      throw new ForbiddenException('Missing upload credentials');
    }
    // Independently validate key server-side against path traversal and illegal formats
    this.storage.assertSafeStorageKey(key);

    const expires = Number(expiresStr);
    if (!Number.isFinite(expires) || !this.storage.verifyToken(key, token, expires)) {
      throw new ForbiddenException('Invalid or expired upload signature');
    }

    let fileBuffer: Buffer;
    if (Buffer.isBuffer(req.body)) {
      fileBuffer = req.body;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      fileBuffer = Buffer.concat(chunks);
    }
    await this.storage.saveLocalFile(key, fileBuffer);

    return { status: 'ok' };
  }
}

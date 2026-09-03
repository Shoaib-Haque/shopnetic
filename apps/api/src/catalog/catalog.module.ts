import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';
import { BrandController } from './brand.controller.js';
import { BrandService } from './brand.service.js';

/** Catalog context (plan/07 §"catalog", plan/26). Categories + brands so far. */
@Module({
  controllers: [CategoryController, BrandController],
  providers: [CategoryService, BrandService],
  exports: [CategoryService, BrandService],
})
export class CatalogModule {}

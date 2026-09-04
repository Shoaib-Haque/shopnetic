import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';
import { BrandController } from './brand.controller.js';
import { BrandService } from './brand.service.js';
import { OptionTypeController } from './option-type.controller.js';
import { OptionTypeService } from './option-type.service.js';

/** Catalog context (plan/07 §"catalog", plan/26). Categories + brands + option types so far. */
@Module({
  controllers: [CategoryController, BrandController, OptionTypeController],
  providers: [CategoryService, BrandService, OptionTypeService],
  exports: [CategoryService, BrandService, OptionTypeService],
})
export class CatalogModule {}

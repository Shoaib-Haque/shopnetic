import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';
import { BrandController } from './brand.controller.js';
import { BrandService } from './brand.service.js';
import { OptionTypeController } from './option-type.controller.js';
import { OptionTypeService } from './option-type.service.js';
import { ValueSetController } from './value-set.controller.js';
import { ValueSetService } from './value-set.service.js';
import { CategoryOptionController } from './category-option.controller.js';
import { CategoryOptionService } from './category-option.service.js';

/**
 * Catalog context (plan/07 §"catalog", plan/26). So far: categories, brands,
 * option types + values, value sets, per-category option config.
 */
@Module({
  controllers: [
    CategoryController,
    BrandController,
    OptionTypeController,
    ValueSetController,
    CategoryOptionController,
  ],
  providers: [
    CategoryService,
    BrandService,
    OptionTypeService,
    ValueSetService,
    CategoryOptionService,
  ],
  exports: [
    CategoryService,
    BrandService,
    OptionTypeService,
    ValueSetService,
    CategoryOptionService,
  ],
})
export class CatalogModule {}

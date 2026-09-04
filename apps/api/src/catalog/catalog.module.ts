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
import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';
import { ProductOptionController } from './product-option.controller.js';
import { ProductOptionService } from './product-option.service.js';
import { VariantController } from './variant.controller.js';
import { VariantService } from './variant.service.js';

/**
 * Catalog context (plan/07 §"catalog", plan/26). So far: categories, brands,
 * option types + values, value sets, per-category option config, products with
 * options / offered values / variants. `offer` (price + stock) lands with the
 * inventory context.
 */
@Module({
  controllers: [
    CategoryController,
    BrandController,
    OptionTypeController,
    ValueSetController,
    CategoryOptionController,
    ProductController,
    ProductOptionController,
    VariantController,
  ],
  providers: [
    CategoryService,
    BrandService,
    OptionTypeService,
    ValueSetService,
    CategoryOptionService,
    ProductService,
    ProductOptionService,
    VariantService,
  ],
  exports: [
    CategoryService,
    BrandService,
    OptionTypeService,
    ValueSetService,
    CategoryOptionService,
    ProductService,
    ProductOptionService,
    VariantService,
  ],
})
export class CatalogModule {}

import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

/** Every field optional; at least one must be supplied. */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

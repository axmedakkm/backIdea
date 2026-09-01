import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { PropertyStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreatePropertyDto } from './create-property.dto';

/**
 * All creation fields are optional here, minus `agentId` — reassigning a listing
 * to a different agent is an admin operation exposed through the admin module.
 */
export class UpdatePropertyDto extends PartialType(
  OmitType(CreatePropertyDto, ['agentId'] as const),
) {
  @ApiPropertyOptional({
    enum: [PropertyStatus.DRAFT, PropertyStatus.SOLD, PropertyStatus.RENTED],
    description:
      'Owners may move a listing to DRAFT, SOLD or RENTED. Moderation statuses ' +
      '(PENDING, APPROVED, REJECTED) are set by admins only.',
  })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;
}

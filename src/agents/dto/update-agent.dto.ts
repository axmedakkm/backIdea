import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Fields an agent may change on their own profile.
 * `isVerified`, `rating` and `propertyCount` are intentionally absent:
 * they are set by admins or derived by the system.
 */
export class UpdateAgentDto {
  @ApiPropertyOptional({
    example: 'Fifteen years placing families in Brooklyn brownstones.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ example: 'Rivera & Co Realty', maxLength: 120 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(120)
  company?: string;

  @ApiPropertyOptional({
    example: 'NY-RE-8842190',
    maxLength: 60,
    description: 'Real-estate licence number. Must be unique across agents.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(60)
  licenseNo?: string;

  @ApiPropertyOptional({ example: 'https://rivera-realty.example.com' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'website must be a valid URL' })
  @MaxLength(300)
  website?: string;

  @ApiPropertyOptional({ example: '+12125550188', description: 'E.164 formatted office number' })
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'officePhone must be a valid international phone number' })
  officePhone?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Primary location the agent operates in' })
  @IsOptional()
  @IsUUID('4', { message: 'locationId must be a valid UUID' })
  locationId?: string;
}

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { MessageOnlyEntity } from '../auth/entities/auth-response.entity';
import { ApiMessage } from '../common/decorators/api-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorResponse } from '../common/dto/api-response.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { ALLOWED_IMAGE_MIME_TYPES } from '../uploads/uploads.service';
import { PropertyImageEntity } from './entities/property.entity';
import { PropertyImagesService } from './property-images.service';

/**
 * Multer keeps files in memory so they can be streamed straight to the storage
 * provider without touching the local filesystem first. Size and count are
 * capped here; MIME type is re-validated in UploadsService.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_FILES = 30;

@ApiTags('Property Images')
@Controller('properties/:propertyId/images')
export class PropertyImagesController {
  constructor(private readonly imagesService: PropertyImagesService) {}

  @Public()
  @Get()
  @ApiMessage('Property images retrieved successfully')
  @ApiOperation({
    summary: 'List images for a property',
    description: 'Public endpoint. The cover image is returned first.',
  })
  @ApiParam({ name: 'propertyId', format: 'uuid', description: 'Property ID' })
  @ApiOkResponse({ description: 'Images returned', type: [PropertyImageEntity] })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  list(@Param('propertyId', new ParseUUIDPipe({ version: '4' })) propertyId: string) {
    return this.imagesService.list(propertyId);
  }

  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor('files', MAX_UPLOAD_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES },
    }),
  )
  @ApiMessage('Images uploaded successfully')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload images to a property',
    description:
      'AGENT (own listings) and ADMIN only. Send one or more files under the `files` field. ' +
      `Accepted types: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}. Per-file size and per-request ` +
      'count limits come from MAX_FILE_SIZE_MB and MAX_FILES_PER_UPLOAD. A listing holds at ' +
      'most 30 images in total. The first image uploaded to an empty listing becomes the cover.',
  })
  @ApiParam({ name: 'propertyId', format: 'uuid', description: 'Property ID' })
  @ApiBody({
    description: 'Multipart form containing one or more image files',
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Image files to attach to the listing',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Images stored', type: [PropertyImageEntity] })
  @ApiBadRequestResponse({
    description: 'No files, unsupported MIME type, file too large, or image limit reached',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Listing belongs to another agent', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Property not found', type: ApiErrorResponse })
  upload(
    @Param('propertyId', new ParseUUIDPipe({ version: '4' })) propertyId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.imagesService.upload(propertyId, files, actor);
  }

  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Patch(':imageId/primary')
  @ApiMessage('Cover image updated successfully')
  @ApiOperation({
    summary: 'Set a property cover image',
    description:
      'AGENT (own listings) and ADMIN only. Exactly one image per listing is the cover; ' +
      'promoting an image demotes the previous cover.',
  })
  @ApiParam({ name: 'propertyId', format: 'uuid', description: 'Property ID' })
  @ApiParam({ name: 'imageId', format: 'uuid', description: 'Image ID' })
  @ApiOkResponse({ description: 'Cover image updated', type: PropertyImageEntity })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Listing belongs to another agent', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Property or image not found', type: ApiErrorResponse })
  setPrimary(
    @Param('propertyId', new ParseUUIDPipe({ version: '4' })) propertyId: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.imagesService.setPrimary(propertyId, imageId, actor);
  }

  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Delete(':imageId')
  @HttpCode(HttpStatus.OK)
  @ApiMessage('Image deleted successfully')
  @ApiOperation({
    summary: 'Delete a property image',
    description:
      'AGENT (own listings) and ADMIN only. Removes the file from storage as well as the ' +
      'database row. Deleting the cover promotes the next image in sort order.',
  })
  @ApiParam({ name: 'propertyId', format: 'uuid', description: 'Property ID' })
  @ApiParam({ name: 'imageId', format: 'uuid', description: 'Image ID' })
  @ApiOkResponse({ description: 'Image deleted', type: MessageOnlyEntity })
  @ApiUnauthorizedResponse({ description: 'Authentication required', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Listing belongs to another agent', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Property or image not found', type: ApiErrorResponse })
  remove(
    @Param('propertyId', new ParseUUIDPipe({ version: '4' })) propertyId: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.imagesService.remove(propertyId, imageId, actor);
  }
}

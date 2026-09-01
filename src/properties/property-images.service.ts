import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { PropertyImageEntity } from './entities/property.entity';
import { PropertiesService } from './properties.service';

/** Hard ceiling on images per listing, independent of per-request limits. */
const MAX_IMAGES_PER_PROPERTY = 30;

@Injectable()
export class PropertyImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly properties: PropertiesService,
    private readonly config: ConfigService,
  ) {}

  async list(propertyId: string): Promise<PropertyImageEntity[]> {
    const exists = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Property with ID "${propertyId}" was not found`);
    }

    return this.prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async upload(
    propertyId: string,
    files: Express.Multer.File[],
    actor: AuthenticatedUser,
  ): Promise<PropertyImageEntity[]> {
    await this.properties.findOwnedOrThrow(propertyId, actor);

    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }

    const existingCount = await this.prisma.propertyImage.count({ where: { propertyId } });

    if (existingCount + files.length > MAX_IMAGES_PER_PROPERTY) {
      throw new BadRequestException(
        `A property can hold at most ${MAX_IMAGES_PER_PROPERTY} images ` +
          `(currently ${existingCount}, attempted to add ${files.length})`,
      );
    }

    const stored = await this.uploads.uploadImages(files, `properties/${propertyId}`);

    try {
      const created = await this.prisma.$transaction(
        stored.map((file, index) =>
          this.prisma.propertyImage.create({
            data: {
              propertyId,
              url: file.url,
              publicId: file.publicId,
              // The first image on an empty listing becomes the cover.
              isPrimary: existingCount === 0 && index === 0,
              sortOrder: existingCount + index,
            },
          }),
        ),
      );

      return created;
    } catch (error) {
      // Keep storage consistent with the database if the insert fails.
      await Promise.all(stored.map((file) => this.uploads.deleteImage(file.publicId)));
      throw error;
    }
  }

  async setPrimary(
    propertyId: string,
    imageId: string,
    actor: AuthenticatedUser,
  ): Promise<PropertyImageEntity> {
    await this.properties.findOwnedOrThrow(propertyId, actor);

    const image = await this.prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId },
    });

    if (!image) {
      throw new NotFoundException(`Image "${imageId}" was not found on this property`);
    }

    const [, updated] = await this.prisma.$transaction([
      // Exactly one image may be primary, so clear the others first.
      this.prisma.propertyImage.updateMany({
        where: { propertyId, id: { not: imageId } },
        data: { isPrimary: false },
      }),
      this.prisma.propertyImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ]);

    return updated;
  }

  async remove(
    propertyId: string,
    imageId: string,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.properties.findOwnedOrThrow(propertyId, actor);

    const image = await this.prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId },
    });

    if (!image) {
      throw new NotFoundException(`Image "${imageId}" was not found on this property`);
    }

    await this.prisma.propertyImage.delete({ where: { id: imageId } });
    await this.uploads.deleteImage(image.publicId);

    // Promote the next image so the listing keeps a cover photo.
    if (image.isPrimary) {
      const next = await this.prisma.propertyImage.findFirst({
        where: { propertyId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      });

      if (next) {
        await this.prisma.propertyImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: 'Image deleted successfully' };
  }

  /** Multer limits, exposed so the controller and Swagger stay in sync. */
  get limits() {
    return {
      fileSize: this.config.get<number>('app.maxFileSizeBytes', 5 * 1024 * 1024),
      files: this.config.get<number>('app.maxFilesPerUpload', 10),
    };
  }
}

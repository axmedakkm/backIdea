import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';

export interface StoredFile {
  url: string;
  publicId: string;
}

const LOCAL_UPLOAD_DIR = join(process.cwd(), 'uploads');
const LOCAL_PUBLIC_ID_PREFIX = 'local:';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

/**
 * Stores uploaded images.
 *
 * Uses Cloudinary when credentials are configured; otherwise falls back to
 * local disk so the API remains usable in development without a cloud account.
 * Binaries are never written to PostgreSQL — only the resulting URL is stored.
 */
@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private cloudinaryEnabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.cloudinaryEnabled = this.config.get<boolean>('cloudinary.enabled', false);

    if (this.cloudinaryEnabled) {
      cloudinary.config({
        cloud_name: this.config.get<string>('cloudinary.cloudName'),
        api_key: this.config.get<string>('cloudinary.apiKey'),
        api_secret: this.config.get<string>('cloudinary.apiSecret'),
        secure: true,
      });
      this.logger.log('Image uploads will be stored in Cloudinary');
    } else {
      this.logger.warn(
        'Cloudinary credentials are not configured — falling back to local disk storage under ./uploads. ' +
          'Set CLOUDINARY_* environment variables before deploying to production.',
      );
    }
  }

  async uploadImage(file: Express.Multer.File, folder = 'properties'): Promise<StoredFile> {
    this.assertValidImage(file);

    return this.cloudinaryEnabled
      ? this.uploadToCloudinary(file, folder)
      : this.uploadToDisk(file, folder);
  }

  async uploadImages(files: Express.Multer.File[], folder = 'properties'): Promise<StoredFile[]> {
    const maxFiles = this.config.get<number>('app.maxFilesPerUpload', 10);

    if (files.length === 0) {
      throw new BadRequestException('At least one image file is required');
    }

    if (files.length > maxFiles) {
      throw new BadRequestException(`You can upload at most ${maxFiles} images at a time`);
    }

    files.forEach((file) => this.assertValidImage(file));

    const uploaded: StoredFile[] = [];

    try {
      for (const file of files) {
        uploaded.push(await this.uploadImage(file, folder));
      }
    } catch (error) {
      // Roll back anything already stored so a partial batch does not leak files.
      await Promise.all(uploaded.map((stored) => this.deleteImage(stored.publicId)));
      throw error;
    }

    return uploaded;
  }

  async deleteImage(publicId: string | null): Promise<void> {
    if (!publicId) {
      return;
    }

    try {
      if (publicId.startsWith(LOCAL_PUBLIC_ID_PREFIX)) {
        await unlink(join(LOCAL_UPLOAD_DIR, publicId.slice(LOCAL_PUBLIC_ID_PREFIX.length)));
        return;
      }

      if (this.cloudinaryEnabled) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error) {
      // A missing remote file must not fail the surrounding database operation.
      this.logger.warn(`Could not delete stored image "${publicId}": ${(error as Error).message}`);
    }
  }

  private assertValidImage(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Uploaded file is empty');
    }

    const allowed: readonly string[] = ALLOWED_IMAGE_MIME_TYPES;

    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed types: ${allowed.join(', ')}.`,
      );
    }

    const maxBytes = this.config.get<number>('app.maxFileSizeBytes', 5 * 1024 * 1024);

    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File "${file.originalname}" is ${(file.size / 1024 / 1024).toFixed(2)} MB, ` +
          `which exceeds the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit`,
      );
    }
  }

  private uploadToCloudinary(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    return new Promise<StoredFile>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `esca-estate/${folder}`,
          resource_type: 'image',
          transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            reject(
              new BadRequestException(
                `Image upload failed: ${error?.message ?? 'no response from storage provider'}`,
              ),
            );
            return;
          }

          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );

      stream.end(file.buffer);
    });
  }

  private async uploadToDisk(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    const directory = join(LOCAL_UPLOAD_DIR, folder);
    await mkdir(directory, { recursive: true });

    // Never trust the client-supplied filename; derive a safe one.
    const extension = extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    const filename = `${randomUUID()}${extension}`;
    const relativePath = `${folder}/${filename}`;

    await writeFile(join(directory, filename), file.buffer);

    // Cloudinary always returns an absolute `secure_url`; the disk fallback must match
    // that shape, otherwise clients that store the URL as-is render a broken image.
    const baseUrl = this.config.get<string>('app.baseUrl', 'http://localhost:3000');

    return {
      url: `${baseUrl}/uploads/${relativePath}`,
      publicId: `${LOCAL_PUBLIC_ID_PREFIX}${relativePath}`,
    };
  }
}

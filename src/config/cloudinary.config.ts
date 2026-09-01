import { registerAs } from '@nestjs/config';

export interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  /** True only when all three credentials are present. */
  enabled: boolean;
}

export const cloudinaryConfig = registerAs<CloudinaryConfig>('cloudinary', () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || undefined;
  const apiKey = process.env.CLOUDINARY_API_KEY || undefined;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || undefined;

  return {
    cloudName,
    apiKey,
    apiSecret,
    enabled: Boolean(cloudName && apiKey && apiSecret),
  };
});

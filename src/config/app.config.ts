import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  /** Public origin the API is reachable on, used to build absolute URLs (e.g. local-disk image links). */
  baseUrl: string;
  corsOrigins: string[];
  bcryptSaltRounds: number;
  throttleTtl: number;
  throttleLimit: number;
  maxFileSizeBytes: number;
  maxFilesPerUpload: number;
}

export const appConfig = registerAs<AppConfig>('app', () => {
  const port = parseInt(process.env.PORT ?? '3000', 10);

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    // Falls back to localhost:PORT so uploaded-file URLs stay absolute in dev too.
    baseUrl: (process.env.APP_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),
    corsOrigins: (process.env.FRONTEND_URL ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
    throttleTtl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    throttleLimit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB ?? '5', 10) * 1024 * 1024,
    maxFilesPerUpload: parseInt(process.env.MAX_FILES_PER_UPLOAD ?? '10', 10),
  };
});

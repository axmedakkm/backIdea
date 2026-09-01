import { SetMetadata } from '@nestjs/common';

export const API_MESSAGE_KEY = 'api:message';

/**
 * Sets the `message` field of the success envelope for a handler.
 * Without it the interceptor falls back to a generic message.
 */
export const ApiMessage = (message: string) => SetMetadata(API_MESSAGE_KEY, message);

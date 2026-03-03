import pino from 'pino';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: 'bridge-dashboard',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      isDev
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'service,env,hostname' }, level: process.env.LOG_LEVEL ?? 'info' }
        : { target: 'pino/file', options: { destination: 1 }, level: process.env.LOG_LEVEL ?? 'info' },
      {
        target: 'pino-roll',
        options: {
          file: path.join(LOG_DIR, 'app'),
          frequency: 'daily',
          dateFormat: 'yyyy-MM-dd',
          limit: { count: 7 },
          mkdir: true,
        },
        level: 'debug',
      },
    ],
  },
});

export type Logger = pino.Logger;

/** Compact route key for log context: "ethereum→arbitrum/USDC/$1000" */
export function routeTag(src: string, dst: string, asset: string, amountTier: number): string {
  return `${src}→${dst}/${asset}/$${amountTier}`;
}

/** Generate a short request ID (8 chars from UUID) */
export function genReqId(): string {
  return randomUUID().slice(0, 8);
}

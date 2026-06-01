import { validateEnv, AppConfig } from './env';

/**
 * Validated application configuration
 * All environment variables are validated and typed
 * 
 * Usage:
 *   import { config } from './config';
 *   const port = config.PORT;
 *   const dbUrl = config.DATABASE_URL;
 */

let appConfig: AppConfig | null = null;

export function initializeConfig(): AppConfig {
  if (appConfig === null) {
    appConfig = validateEnv();
  }
  return appConfig;
}

export function getConfig(): AppConfig {
  if (appConfig === null) {
    throw new Error('Config not initialized. Call initializeConfig() first.');
  }
  return appConfig;
}

// Export a proxy to ensure validation happens first
export const config: AppConfig = new Proxy({} as AppConfig, {
  get: (_, prop) => {
    if (appConfig === null) {
      initializeConfig();
    }
    return (appConfig as any)[prop];
  },
});

export type { AppConfig };

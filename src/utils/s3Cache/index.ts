import { S3DownloadCache } from './S3DownloadCache.js';
import type { CacheOptions, CacheStats } from './types.js';

/**
 * Singleton cache instance
 */
let cacheInstance: S3DownloadCache | null = null;
let initializationPromise: Promise<void> | null = null;
let shutdownRegistered = false;

/**
 * Get or create the singleton S3 download cache instance
 *
 * @param options - Optional cache configuration (only used on first call)
 * @returns Initialized cache instance
 */
export async function getS3Cache(options?: CacheOptions): Promise<S3DownloadCache> {
  // Return existing instance if available
  if (cacheInstance) {
    // Wait for initialization if in progress
    if (initializationPromise) {
      await initializationPromise;
    }
    return cacheInstance;
  }

  // Create new instance
  cacheInstance = new S3DownloadCache(options);

  // Initialize cache (create directories)
  initializationPromise = cacheInstance.initialize();
  await initializationPromise;
  initializationPromise = null;

  // Register shutdown handlers on first initialization
  if (!shutdownRegistered) {
    registerShutdownHandlers();
    shutdownRegistered = true;
  }

  return cacheInstance;
}

/**
 * Get cache instance synchronously (returns null if not initialized)
 *
 * Use this when you need to check if cache exists without async initialization
 */
export function getCacheSync(): S3DownloadCache | null {
  return cacheInstance;
}

/**
 * Shutdown the cache and cleanup resources
 *
 * This should be called when the application is shutting down
 */
export async function shutdownCache(): Promise<void> {
  if (cacheInstance) {
    await cacheInstance.shutdown();
    cacheInstance = null;
    initializationPromise = null;
  }
}

/**
 * Get cache statistics (returns null if cache not initialized)
 */
export function getCacheStats(): CacheStats | null {
  return cacheInstance?.getStats() ?? null;
}

/**
 * Clear the entire cache
 */
export async function clearCache(): Promise<void> {
  if (cacheInstance) {
    await cacheInstance.clear();
  }
}

/**
 * Check if cache is initialized and enabled
 */
export function isCacheEnabled(): boolean {
  return cacheInstance?.isEnabled() ?? false;
}

/**
 * Register process exit handlers for graceful shutdown
 */
function registerShutdownHandlers(): void {
  // Handle normal exit
  process.on('exit', () => {
    // Note: async operations won't complete in 'exit' handler
    // This is just for synchronous cleanup
    if (cacheInstance) {
      cacheInstance.shutdown().catch(() => {
        // Silently ignore shutdown errors
      });
    }
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    await shutdownCache();
    process.exit(0);
  });

  // Handle SIGTERM
  process.on('SIGTERM', async () => {
    await shutdownCache();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await shutdownCache();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    await shutdownCache();
    process.exit(1);
  });
}

/**
 * Re-export types for convenience
 */
export type { CacheEntry, CacheOptions, CacheConfig, CacheStats, S3DownloadOptions } from './types.js';
export { S3DownloadCache } from './S3DownloadCache.js';

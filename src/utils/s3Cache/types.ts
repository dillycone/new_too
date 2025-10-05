/**
 * Cache entry metadata stored in memory
 */
export interface CacheEntry {
  /** Content-addressed hash used as the cache key */
  key: string;
  /** Original S3 URL */
  s3Url: string;
  /** Path to the cached file on disk */
  filePath: string;
  /** File size in bytes */
  size: number;
  /** ETag from S3 for validation */
  etag?: string;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp when the entry was last accessed */
  lastAccessedAt: number;
  /** Number of times this entry has been accessed */
  hitCount: number;
}

/**
 * Configuration options for cache initialization
 */
export interface CacheOptions {
  /** Maximum cache size in bytes (default: 500MB) */
  maxSize?: number;
  /** Maximum number of entries (default: 200) */
  maxEntries?: number;
  /** Time-to-live for cache entries in milliseconds (default: 24 hours) */
  ttl?: number;
  /** Base directory for cache storage (default: ~/.media-wizard/cache) */
  cacheDir?: string;
  /** Whether to enable cache (default: true) */
  enabled?: boolean;
}

/**
 * Complete cache configuration with defaults applied
 */
export interface CacheConfig {
  maxSize: number;
  maxEntries: number;
  ttl: number;
  cacheDir: string;
  enabled: boolean;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of entries currently in cache */
  entryCount: number;
  /** Total size of cached files in bytes */
  totalSize: number;
  /** Number of evictions (due to size or TTL) */
  evictions: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Number of files cleaned up */
  filesCleanedUp: number;
}

/**
 * Options for downloading from S3
 */
export interface S3DownloadOptions {
  /** AWS profile name */
  profile?: string;
  /** Skip cache and force fresh download */
  skipCache?: boolean;
  /** Validate ETag before using cached file */
  validateETag?: boolean;
}

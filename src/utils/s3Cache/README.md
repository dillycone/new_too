# S3 Download Cache System

A comprehensive caching system for S3 downloads that improves performance and reduces redundant API calls and data transfers.

## Features

- **LRU Eviction Policy**: Automatically evicts least recently used entries when cache is full
- **TTL-Based Expiration**: Cache entries expire after a configurable time-to-live
- **Content-Addressed Storage**: Uses SHA-256 hashing for unique, collision-resistant cache keys
- **Sharded Directory Structure**: Distributes cached files across 256 subdirectories to avoid filesystem bloat
- **ETag Validation**: Validates cached files against S3 ETags to ensure freshness
- **Hybrid Storage**: Memory-based index with disk-based file storage
- **Automatic Cleanup**: Removes orphaned files and expired entries
- **Production-Ready Error Handling**: Graceful fallbacks when cache operations fail
- **Backward Compatible**: Opt-in caching that doesn't break existing code

## Architecture

### Components

1. **types.ts** - Type definitions and interfaces
   - `CacheEntry`: Metadata for cached files
   - `CacheOptions`: Configuration options
   - `CacheStats`: Monitoring and statistics
   - `S3DownloadOptions`: Download configuration

2. **S3DownloadCache.ts** - Core cache implementation
   - LRU cache using `lru-cache` library
   - File management and cleanup
   - ETag validation
   - Statistics tracking

3. **index.ts** - Singleton management
   - Global cache instance
   - Process exit handlers
   - Cleanup on shutdown

### Storage Structure

```
~/.media-wizard/cache/
├── 00/
│   ├── 00a1b2c3d4e5f6...
│   └── 00f9e8d7c6b5a4...
├── 01/
├── 02/
...
└── ff/
```

Files are stored in shard directories (00-ff) based on the first two characters of their SHA-256 hash.

### Cache Key Generation

Cache keys are generated using SHA-256 hash of:
```
SHA256(s3Url + "|" + (profile || "default"))
```

This ensures:
- Unique keys for different S3 URLs
- Unique keys for different AWS profiles
- Collision resistance
- Deterministic lookups

## Configuration

### Environment Variables

```bash
# Enable/disable cache (default: true)
CACHE_ENABLED=true

# Maximum cache size in MB (default: 500)
CACHE_MAX_SIZE_MB=500

# Maximum number of entries (default: 200)
CACHE_MAX_ENTRIES=200

# Time-to-live in hours (default: 24)
CACHE_TTL_HOURS=24
```

### Programmatic Configuration

```typescript
import { getS3Cache } from './s3Cache';

const cache = await getS3Cache({
  enabled: true,
  maxSize: 500 * 1024 * 1024, // 500MB in bytes
  maxEntries: 200,
  ttl: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  cacheDir: '~/.media-wizard/cache', // Optional custom directory
});
```

## Usage

### Basic Usage (Automatic Caching)

```typescript
import { downloadFromS3 } from '../utils/s3';

// Downloads with caching enabled by default
const filePath = await downloadFromS3('s3://bucket/key');
```

### Skip Cache

```typescript
// Force fresh download, bypass cache
const filePath = await downloadFromS3('s3://bucket/key', {
  skipCache: true,
});
```

### Disable ETag Validation

```typescript
// Use cached file without validating ETag
const filePath = await downloadFromS3('s3://bucket/key', {
  validateETag: false,
});
```

### With AWS Profile

```typescript
// Cache key includes profile name
const filePath = await downloadFromS3('s3://bucket/key', {
  profile: 'my-profile',
});
```

### Backward Compatible

```typescript
// Old API still works (string profile parameter)
const filePath = await downloadFromS3('s3://bucket/key', 'my-profile');
```

## Cache Statistics

```typescript
import { getCacheStats } from './s3Cache';

const stats = getCacheStats();
if (stats) {
  console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
  console.log(`Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Entries: ${stats.entryCount}`);
  console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
  console.log(`Evictions: ${stats.evictions}`);
}
```

## Cache Management

### Clear Cache

```typescript
import { clearCache } from './s3Cache';

await clearCache();
```

### Manual Shutdown

```typescript
import { shutdownCache } from './s3Cache';

// Cleanup and shutdown cache
await shutdownCache();
```

### Check Cache Status

```typescript
import { isCacheEnabled } from './s3Cache';

if (isCacheEnabled()) {
  console.log('Cache is active');
}
```

## Performance Improvements

### Expected Performance Gains

1. **First Download**: No improvement (cache miss)
   - Downloads from S3 normally
   - Stores in cache for future use

2. **Subsequent Downloads (Cache Hit)**:
   - **Network**: 100% reduction (no S3 API call, no data transfer)
   - **Time**: 90-99% faster (disk read vs network download)
   - **Cost**: Reduced S3 API costs

3. **With ETag Validation**:
   - **Network**: ~95% reduction (small HEAD request vs full download)
   - **Time**: 80-95% faster (HEAD + disk read vs full download)

### Real-World Examples

**Small file (10MB)**:
- Without cache: 2-5 seconds (network dependent)
- With cache: 0.1-0.3 seconds (disk read)
- Improvement: **10-50x faster**

**Large file (100MB)**:
- Without cache: 20-60 seconds
- With cache: 0.5-1 seconds
- Improvement: **20-120x faster**

**Repeated workflow**:
- Process 10 videos using same reference file
- Without cache: 10 downloads
- With cache: 1 download + 9 cache hits
- Bandwidth saved: **90%**

## Error Handling

The cache system is designed to fail gracefully:

1. **Cache Initialization Fails**: Disables cache, continues without caching
2. **Cache Lookup Fails**: Falls back to normal S3 download
3. **Cache Store Fails**: Download succeeds, caching skipped
4. **Disk Full**: LRU eviction frees space automatically
5. **Corrupted Cache File**: Treated as cache miss, re-downloads

All errors are logged (when verbose mode is enabled) but don't break the download process.

## Cache Lifecycle

### Entry Creation
1. Download file from S3
2. Generate cache key from URL + profile
3. Check available space, evict if needed
4. Copy file to cache directory (sharded path)
5. Store metadata in memory index
6. Update statistics

### Entry Access
1. Generate cache key
2. Check memory index
3. Validate file exists on disk
4. Optionally validate ETag with S3 HEAD request
5. Update access time and hit count
6. Return cached file path

### Entry Eviction
1. Triggered by size limit or entry limit
2. LRU algorithm selects oldest entries
3. Delete file from disk
4. Remove from memory index
5. Update statistics

### Shutdown
1. Clean up orphaned files
2. Clear memory index
3. Release resources

## Best Practices

1. **Enable Cache for Production**: Default settings work well for most use cases
2. **Adjust Size Based on Usage**: If processing large files, increase `CACHE_MAX_SIZE_MB`
3. **Use ETag Validation**: Ensures cache freshness at minimal cost
4. **Monitor Statistics**: Track hit rate to tune cache configuration
5. **Disable for One-Time Scripts**: Use `skipCache: true` for unique downloads

## Troubleshooting

### Low Hit Rate
- Check if S3 URLs are consistent (query parameters, URL format)
- Verify TTL isn't too short
- Ensure cache size is adequate

### Disk Space Issues
- Reduce `CACHE_MAX_SIZE_MB`
- Reduce `CACHE_MAX_ENTRIES`
- Reduce `CACHE_TTL_HOURS`

### Performance Issues
- Increase cache size for better hit rate
- Disable ETag validation for faster cache hits (less safe)
- Check disk I/O performance

### Cache Not Working
- Verify `CACHE_ENABLED=true`
- Check file permissions on cache directory
- Review error logs (enable `VERBOSE=true`)

## Implementation Details

### Thread Safety
- Singleton pattern ensures single cache instance
- LRU cache handles concurrent access
- File operations are atomic

### Memory Usage
- Metadata only (CacheEntry objects)
- ~200 bytes per entry
- 200 entries = ~40KB memory
- Files stored on disk, not in memory

### Cleanup Strategy
- Automatic cleanup on eviction
- Orphaned file cleanup on initialization
- Graceful shutdown cleanup

## Future Enhancements

Potential improvements:
1. Persistent metadata across restarts
2. Background cleanup jobs
3. Cache warming strategies
4. Compression for cached files
5. Distributed cache support
6. Cache analytics and reporting

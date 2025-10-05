export interface S3Location {
  bucket: string;
  key: string;
  region?: string;
}

/**
 * Parse S3 URL into bucket and key
 * Supports the major hosted-style and path-style formats, including signed URLs
 */
export function parseS3Url(url: string): S3Location | null {
  if (!url) {
    return null;
  }

  const s3Match = url.match(/^s3:\/\/([^\/]+)\/(.+)$/i);
  if (s3Match) {
    const [, bucket, keyAndQuery] = s3Match;
    if (bucket && keyAndQuery) {
      const [keyWithoutQuery] = keyAndQuery.split('?');
      if (!keyWithoutQuery) {
        return null;
      }
      return {
        bucket,
        key: decodeURIComponent(keyWithoutQuery),
      };
    }
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const { hostname, pathname } = parsedUrl;
  const [cleanPathRaw] = pathname.replace(/^\/+/, '').split('?');
  const cleanPath = cleanPathRaw ?? '';

  const virtualHostMatch = hostname.match(
    /^(?<bucket>.+?)\.s3(?:(?:[.-](?<qualifier>accelerate|dualstack))?(?:[.-](?<region>[a-z0-9-]+))?)?\.amazonaws\.com$/i
  );
  if (virtualHostMatch && cleanPath) {
    const bucket = virtualHostMatch.groups?.bucket;
    if (bucket) {
      const region = virtualHostMatch.groups?.region;
      const location: S3Location = {
        bucket,
        key: decodeURIComponent(cleanPath),
      };
      if (region) {
        location.region = region;
      }
      return location;
    }
  }

  const pathStyleMatch = hostname.match(/^s3[.-](?<region>[^.]+)\.amazonaws\.com$/i);
  if (pathStyleMatch && cleanPath) {
    const [bucket, ...keyParts] = cleanPath.split('/');
    if (bucket && keyParts.length) {
      const location: S3Location = {
        bucket,
        key: decodeURIComponent(keyParts.join('/')),
      };
      const region = pathStyleMatch.groups?.region;
      if (region) {
        location.region = region;
      }
      return location;
    }
  }

  if (/^s3\.amazonaws\.com$/i.test(hostname) && cleanPath) {
    const [bucket, ...keyParts] = cleanPath.split('/');
    if (bucket && keyParts.length) {
      return {
        bucket,
        key: decodeURIComponent(keyParts.join('/')),
      };
    }
  }

  return null;
}

/**
 * Check if a string is an S3 URL
 */
export function isS3Url(path: string): boolean {
  return parseS3Url(path) !== null;
}

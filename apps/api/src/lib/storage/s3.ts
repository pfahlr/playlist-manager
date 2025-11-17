import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { env } from '../../config/env';
import { Readable } from 'node:stream';

/**
 * S3 Client Configuration
 * Supports both AWS S3 and MinIO (S3-compatible local storage)
 */
export function createS3Client(): S3Client {
  const config: any = {
    region: env.AWS_REGION,
  };

  // For MinIO local development, use custom endpoint
  if (env.S3_ENDPOINT) {
    config.endpoint = env.S3_ENDPOINT;
    config.forcePathStyle = true; // Required for MinIO
  }

  // Use explicit credentials if provided, otherwise use default credential chain
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new S3Client(config);
}

/**
 * Upload a file to S3
 * @param key - S3 object key (path in bucket)
 * @param body - File content (Buffer or Stream)
 * @param contentType - MIME type
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Readable | string,
  contentType?: string
): Promise<{ url: string; key: string }> {
  const bucket = env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET environment variable not configured');
  }

  const s3 = createS3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3.send(command);

  // Generate public URL
  // For MinIO: http://localhost:9000/bucket/key
  // For AWS S3: https://bucket.s3.region.amazonaws.com/key
  const url = env.S3_ENDPOINT
    ? `${env.S3_ENDPOINT}/${bucket}/${key}`
    : `https://${bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;

  return { url, key };
}

/**
 * Download a file from S3
 * @param key - S3 object key
 * @returns Readable stream
 */
export async function downloadFromS3(key: string): Promise<Readable> {
  const bucket = env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET environment variable not configured');
  }

  const s3 = createS3Client();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3.send(command);

  if (!response.Body) {
    throw new Error(`Object ${key} has no body`);
  }

  return response.Body as Readable;
}

/**
 * Delete a file from S3
 * @param key - S3 object key
 */
export async function deleteFromS3(key: string): Promise<void> {
  const bucket = env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET environment variable not configured');
  }

  const s3 = createS3Client();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3.send(command);
}

/**
 * Check if a file exists in S3
 * @param key - S3 object key
 * @returns true if exists, false otherwise
 */
export async function existsInS3(key: string): Promise<boolean> {
  const bucket = env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET environment variable not configured');
  }

  const s3 = createS3Client();

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await s3.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Generate a unique S3 key for export files
 * Format: exports/{userId}/{jobId}/{filename}
 */
export function generateExportKey(
  userId: number,
  jobId: number,
  filename: string
): string {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `exports/${userId}/${jobId}/${sanitizedFilename}`;
}

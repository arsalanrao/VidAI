import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, r2Configured } from '../../config/env.js';

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!r2Configured) {
    throw new Error('R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.');
  }

  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }

  return client;
}

export type UploadOptions = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  cacheControl?: string;
};

export async function uploadObject(options: UploadOptions): Promise<string> {
  const { key, body, contentType, cacheControl } = options;

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );

  return getObjectUrl(key);
}

export async function downloadObject(key: string): Promise<Buffer> {
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`R2 object not found: ${key}`);
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
    }),
  );
}

export function getObjectUrl(key: string): string {
  if (env.r2PublicUrl) {
    return `${env.r2PublicUrl.replace(/\/$/, '')}/${key}`;
  }

  return key;
}

export async function getSignedObjectUrl(key: string, expiresInSeconds = 60 * 60 * 24 * 7): Promise<string> {
  if (env.r2PublicUrl) {
    return getObjectUrl(key);
  }

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function checkR2Connection(): Promise<void> {
  await getClient().send(
    new ListObjectsV2Command({
      Bucket: env.r2Bucket,
      MaxKeys: 1,
    }),
  );
}

export function projectKey(projectId: string, ...parts: string[]): string {
  return ['projects', projectId, ...parts].join('/');
}

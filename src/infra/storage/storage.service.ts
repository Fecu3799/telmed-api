import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly presignTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const endpoint = configService.get<string>('S3_ENDPOINT');
    const region = configService.getOrThrow<string>('S3_REGION');
    const accessKeyId = configService.getOrThrow<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = configService.getOrThrow<string>(
      'S3_SECRET_ACCESS_KEY',
    );
    const forcePathStyle =
      configService.get<boolean>('S3_FORCE_PATH_STYLE') ??
      configService.get<string>('STORAGE_PROVIDER') === 'minio';

    this.bucket = configService.getOrThrow<string>('S3_BUCKET');
    this.presignTtlSeconds =
      configService.get<number>('PRESIGN_TTL_SECONDS') ?? 300;

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  getBucket(): string {
    return this.bucket;
  }

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength?: number;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: this.presignTtlSeconds,
    });
  }

  async createDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: this.presignTtlSeconds,
    });
  }
}

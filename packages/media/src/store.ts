import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Where rendered media lives until Instagram has fetched it. */
export interface MediaStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** A temporary HTTPS URL Meta can fetch (containers must point at a public URL). */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

const SAFE_KEY = /^[a-zA-Z0-9/_.-]+$/;
function assertKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`Invalid media key: ${key}`);
}

/** Production: private S3 bucket (sa-east-1), objects reachable only through presigned URLs. */
export class S3MediaStore implements MediaStore {
  private readonly client: S3Client;
  constructor(
    private readonly bucket: string,
    options: { region: string; endpoint?: string },
  ) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: Boolean(options.endpoint),
    });
  }

  async put(key: string, data: Buffer, contentType: string) {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
  }

  signedUrl(key: string, ttlSeconds: number) {
    assertKey(key);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }
}

/** Development: files on disk, served by the API at /v1/media/* with an HMAC-signed, expiring URL. */
export class LocalMediaStore implements MediaStore {
  constructor(
    private readonly dir: string,
    private readonly publicBaseUrl: string,
    private readonly secret: string,
  ) {}

  private path(key: string) {
    assertKey(key);
    return normalize(join(this.dir, key));
  }

  async put(key: string, data: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async signedUrl(key: string, ttlSeconds: number) {
    assertKey(key);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `${this.publicBaseUrl}/v1/media/${key}?exp=${exp}&sig=${signLocal(key, exp, this.secret)}`;
  }

  /** Returns the file if the signature is valid and not expired, otherwise null. */
  async read(key: string, exp: number, sig: string): Promise<Buffer | null> {
    if (!SAFE_KEY.test(key) || key.includes("..") || exp < Date.now() / 1000) return null;
    const expected = Buffer.from(signLocal(key, exp, this.secret));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return readFile(this.path(key)).catch(() => null);
  }
}

function signLocal(key: string, exp: number, secret: string) {
  return createHmac("sha256", secret).update(`${key}:${exp}`).digest("base64url");
}

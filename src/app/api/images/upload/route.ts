import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

type ErrorBody = {
  error: string;
  details?: unknown;
};

const sanitizeFilenameSegment = (segment: string): string => {
  return segment.replace(/[^a-zA-Z0-9-_]/g, "-");
};

const normalizeExtension = (extension: string): string => {
  const cleaned = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (!cleaned) return "png";
  return cleaned === "jpeg" ? "jpg" : cleaned;
};

const sanitizeFilename = (filename: string | null): string | null => {
  if (!filename) return null;
  const trimmed = filename.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(".");
  if (parts.length <= 1) {
    return sanitizeFilenameSegment(trimmed);
  }
  const extension = normalizeExtension(parts.pop() || "");
  const base = parts.map((segment) => sanitizeFilenameSegment(segment)).filter(Boolean).join("-");
  const safeBase = base || "upload";
  return `${safeBase}.${extension}`;
};

const joinPublicUrl = (baseUrl: string, key: string): string => {
  const base = baseUrl.replace(/\/+$/, "");
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encodedKey}`;
};

const buildS3Client = (): S3Client | null => {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
};

export async function POST(request: Request) {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;
  const keyPrefix = (process.env.CLOUDFLARE_R2_KEY_PREFIX || "uploads").replace(/^\/+|\/+$/g, "");

  const s3 = buildS3Client();

  if (!bucket) {
    return NextResponse.json<ErrorBody>({ error: "R2_BUCKET_MISSING" }, { status: 500 });
  }
  if (!publicBaseUrl) {
    return NextResponse.json<ErrorBody>({ error: "R2_PUBLIC_BASE_URL_MISSING" }, { status: 500 });
  }
  if (!s3) {
    return NextResponse.json<ErrorBody>({ error: "R2_CREDENTIALS_MISSING" }, { status: 500 });
  }

  const requestFormData = await request.formData();
  const image = requestFormData.get("image");

  if (!(image instanceof Blob)) {
    return NextResponse.json<ErrorBody>({ error: "R2_INVALID_IMAGE" }, { status: 400 });
  }

  const providedFilename =
    typeof requestFormData.get("filename") === "string"
      ? (requestFormData.get("filename") as string)
      : image instanceof File
        ? image.name
        : null;

  const sanitizedFilename = sanitizeFilename(providedFilename) ?? "upload.png";
  const uniqueId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  const key = `${keyPrefix}/${Date.now()}-${uniqueId}-${sanitizedFilename}`;

  let body: Uint8Array;
  try {
    body = new Uint8Array(await image.arrayBuffer());
  } catch (error) {
    console.error("Falha ao ler imagem para upload no R2", error);
    return NextResponse.json<ErrorBody>({ error: "R2_READ_FAILED" }, { status: 400 });
  }

  const contentType = image.type || "application/octet-stream";

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } catch (error) {
    console.error("Falha ao enviar imagem para o R2", error);
    return NextResponse.json<ErrorBody>({ error: "R2_UPLOAD_FAILED", details: error }, { status: 502 });
  }

  return NextResponse.json({ url: joinPublicUrl(publicBaseUrl, key), key });
}


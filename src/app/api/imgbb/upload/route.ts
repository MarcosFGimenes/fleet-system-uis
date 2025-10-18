import { NextResponse } from "next/server";

export const runtime = "nodejs";

const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";

type ImgbbPayload = {
  data?: {
    url?: string;
    display_url?: string;
    image?: { url?: string };
  };
  success?: boolean;
  status?: number;
};

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

const sanitizeName = (name: string | null): string | null => {
  if (!name) return null;
  const sanitized = sanitizeFilenameSegment(name.trim());
  return sanitized || null;
};

export async function POST(request: Request) {
  const apiKey = process.env.IMGBB_API_KEY ?? process.env.NEXT_PUBLIC_IMGBB_API_KEY;

  if (!apiKey) {
    return NextResponse.json<ErrorBody>(
      { error: "IMGBB_API_KEY_MISSING" },
      { status: 500 },
    );
  }

  const requestFormData = await request.formData();
  const image = requestFormData.get("image");

  if (!(image instanceof Blob)) {
    return NextResponse.json<ErrorBody>(
      { error: "IMGBB_INVALID_IMAGE" },
      { status: 400 },
    );
  }

  const providedFilename =
    typeof requestFormData.get("filename") === "string"
      ? (requestFormData.get("filename") as string)
      : image instanceof File
        ? image.name
        : null;
  const providedName =
    typeof requestFormData.get("name") === "string" ? (requestFormData.get("name") as string) : null;

  const sanitizedFilename = sanitizeFilename(providedFilename) ?? "upload.png";
  const sanitizedName = sanitizeName(providedName) ?? sanitizedFilename.replace(/\.[^./]+$/, "");

  const formData = new FormData();
  formData.append("image", image, sanitizedFilename);
  formData.append("name", sanitizedName);

  let response: Response;
  try {
    response = await fetch(`${IMGBB_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    console.error("Falha de rede ao enviar imagem para o ImgBB", error);
    return NextResponse.json<ErrorBody>(
      { error: "IMGBB_NETWORK_ERROR" },
      { status: 502 },
    );
  }

  let payload: ImgbbPayload | null = null;
  try {
    payload = (await response.json()) as ImgbbPayload;
  } catch (error) {
    console.error("Falha ao interpretar resposta do ImgBB", error);
  }

  if (!response.ok || !payload?.success) {
    console.error("Resposta inválida do ImgBB", { status: response.status, payload });
    return NextResponse.json<ErrorBody>(
      {
        error: "IMGBB_UPLOAD_FAILED",
        details: payload,
      },
      { status: 502 },
    );
  }

  const resolvedUrl = payload.data?.url ?? payload.data?.display_url ?? payload.data?.image?.url;
  if (!resolvedUrl) {
    console.error("Resposta do ImgBB sem URL", payload);
    return NextResponse.json<ErrorBody>(
      { error: "IMGBB_UPLOAD_NO_URL" },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: resolvedUrl });
}

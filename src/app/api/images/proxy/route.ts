import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ErrorBody = {
  error: string;
  details?: unknown;
};

const resolveAllowedHosts = () => {
  const hosts = new Set<string>();

  // Ex.: https://pub-xxxx.r2.dev
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;
  if (publicBase) {
    try {
      hosts.add(new URL(publicBase).host);
    } catch {
      // ignore invalid env
    }
  }

  return hosts;
};

const isAllowedRemoteUrl = (remoteUrl: URL) => {
  if (remoteUrl.protocol !== "https:" && remoteUrl.protocol !== "http:") return false;

  // Allow any Cloudflare R2 dev public host and the configured public base host.
  if (remoteUrl.host.endsWith(".r2.dev")) return true;
  if (resolveAllowedHosts().has(remoteUrl.host)) return true;

  return false;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const target = requestUrl.searchParams.get("url");

  if (!target) {
    return NextResponse.json<ErrorBody>({ error: "MISSING_URL" }, { status: 400 });
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(target);
  } catch {
    return NextResponse.json<ErrorBody>({ error: "INVALID_URL" }, { status: 400 });
  }

  if (!isAllowedRemoteUrl(remoteUrl)) {
    return NextResponse.json<ErrorBody>({ error: "URL_NOT_ALLOWED" }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(remoteUrl.toString(), {
      headers: { accept: "image/*" },
      cache: "no-store",
    });
  } catch (error) {
    console.error("Falha ao buscar imagem remota", error);
    return NextResponse.json<ErrorBody>({ error: "UPSTREAM_FETCH_FAILED", details: error }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json<ErrorBody>(
      { error: "UPSTREAM_NOT_OK", details: { status: upstream.status } },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const cacheControl =
    upstream.headers.get("cache-control") ?? "public, max-age=86400, stale-while-revalidate=604800";

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": cacheControl,
    },
  });
}


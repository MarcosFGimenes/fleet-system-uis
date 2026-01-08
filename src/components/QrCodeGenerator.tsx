"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Props = {
  value: string;
  /**
   * Linhas de legenda que devem aparecer abaixo do QR (ex: placa e tag).
   * Também são incluídas no SVG baixado.
   */
  captionLines?: string[];
  fileName?: string;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgTextToBase64DataUrl(svgText: string) {
  // btoa não lida bem com unicode; usamos TextEncoder para garantir compatibilidade.
  const bytes = new TextEncoder().encode(svgText);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export default function QrCodeGenerator({ value, captionLines = [], fileName = "qrcode" }: Props) {
  const svgId = useId();
  const [larLogoSvgDataUrl, setLarLogoSvgDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/Logotipo_da_Lar_Cooperativa_Agroindustrial.svg", { cache: "force-cache" });
        if (!res.ok) return;
        const text = await res.text();
        if (cancelled) return;
        setLarLogoSvgDataUrl(svgTextToBase64DataUrl(text));
      } catch {
        // Se falhar, o QR ainda funciona sem logo.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const qrSize = 192;
  const logoBoxSize = Math.max(38, Math.min(56, Math.round(qrSize * 0.23))); // ~23% do QR (seguro p/ leitura)

  const larBadgeDataUrl = useMemo(() => {
    if (!larLogoSvgDataUrl) return null;

    // Badge “tipo WhatsApp Web”: círculo branco + logo central com padding.
    // Usamos um SVG wrapper para garantir padding/forma sem depender do arquivo da logo.
    const innerSize = 64; // área da logo dentro do badge (0..100)
    const innerOffset = (100 - innerSize) / 2;
    const badgeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#ffffff"/>
  <image href="${escapeXml(larLogoSvgDataUrl)}" x="${innerOffset}" y="${innerOffset}" width="${innerSize}" height="${innerSize}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

    return svgTextToBase64DataUrl(badgeSvg);
  }, [larLogoSvgDataUrl]);

  const handleDownload = () => {
    const svg = document.getElementById(svgId) as SVGSVGElement | null;
    if (!svg) return;

    const qrSvgString = new XMLSerializer().serializeToString(svg);
    const qrWidth = Number(svg.getAttribute("width") ?? "192") || 192;
    const qrHeight = Number(svg.getAttribute("height") ?? "192") || 192;

    const rawLines = captionLines.map((line) => line.trim()).filter(Boolean);
    const lines = rawLines.map((line, idx) =>
      idx === 0 ? `Placa: ${line}` : idx === 1 ? `Tag: ${line}` : line
    );

    const padding = 24;
    const gap = lines.length > 0 ? 14 : 0;
    const lineGap = 6;
    const fontFamily =
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

    // Tipografia pensada para adesivo (boa leitura em impressão)
    const fontSizes = lines.map((_, idx) => (idx === 0 ? 20 : 16));
    const textBlockHeight =
      lines.length === 0
        ? 0
        : fontSizes.reduce((sum, size) => sum + size, 0) + lineGap * (lines.length - 1);

    const stickerWidth = qrWidth + padding * 2;
    const stickerHeight = padding + qrHeight + gap + textBlockHeight + padding;
    const centerX = stickerWidth / 2;

    let currentY = padding + qrHeight + gap;
    const textElements = lines
      .map((line, idx) => {
        const fontSize = fontSizes[idx] ?? 16;
        currentY += fontSize;
        const isPrimary = idx === 0;
        const text = `
  <text
    x="${centerX}"
    y="${currentY}"
    text-anchor="middle"
    font-family="${escapeXml(fontFamily)}"
    font-size="${fontSize}"
    font-weight="${isPrimary ? 700 : 600}"
    fill="${isPrimary ? "#111827" : "#374151"}"
    letter-spacing="${isPrimary ? "0.5" : "0.2"}"
  >${escapeXml(line)}</text>`;
        currentY += lineGap;
        return text;
      })
      .join("");

    const stickerSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${stickerWidth}"
  height="${stickerHeight}"
  viewBox="0 0 ${stickerWidth} ${stickerHeight}"
>
  <rect width="100%" height="100%" fill="#ffffff" />
  <svg x="${padding}" y="${padding}" width="${qrWidth}" height="${qrHeight}">
    ${qrSvgString}
  </svg>
  ${textElements}
</svg>`;

    const svgBlob = new Blob([stickerSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-md border border-[var(--border)] bg-white p-4 shadow-sm">
        <QRCodeSVG
          id={svgId}
          value={value}
          size={qrSize}
          includeMargin
          level="H"
          bgColor="#ffffff"
          fgColor="#0b0f19"
          imageSettings={
            larBadgeDataUrl
              ? {
                  src: larBadgeDataUrl,
                  height: logoBoxSize,
                  width: logoBoxSize,
                  excavate: true,
                }
              : undefined
          }
        />
      </div>
      {captionLines.filter(Boolean).length > 0 && (
        <div className="text-center">
          {captionLines
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, idx) => {
              const display = idx === 0 ? `Placa: ${line}` : idx === 1 ? `Tag: ${line}` : line;
              return (
                <p
                  key={`${idx}-${display}`}
                  className={
                    idx === 0
                      ? "text-base font-semibold text-[var(--text)]"
                      : "text-sm font-medium text-[var(--muted)]"
                  }
                >
                  {display}
                </p>
              );
            })}
        </div>
      )}
      <button
        onClick={handleDownload}
        className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        Baixar adesivo (.svg)
      </button>
    </div>
  );
}

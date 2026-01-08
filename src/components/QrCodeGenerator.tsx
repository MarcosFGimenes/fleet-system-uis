"use client";

import { useId } from "react";
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

export default function QrCodeGenerator({ value, captionLines = [], fileName = "qrcode" }: Props) {
  const svgId = useId();

  const handleDownload = () => {
    const svg = document.getElementById(svgId) as SVGSVGElement | null;
    if (!svg) return;

    const qrSvgString = new XMLSerializer().serializeToString(svg);
    const qrWidth = Number(svg.getAttribute("width") ?? "192") || 192;
    const qrHeight = Number(svg.getAttribute("height") ?? "192") || 192;

    const lines = captionLines.map((line) => line.trim()).filter(Boolean);

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
        <QRCodeSVG id={svgId} value={value} size={192} includeMargin />
      </div>
      {captionLines.filter(Boolean).length > 0 && (
        <div className="text-center">
          {captionLines
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, idx) => (
              <p
                key={`${idx}-${line}`}
                className={
                  idx === 0
                    ? "text-base font-semibold text-[var(--text)]"
                    : "text-sm font-medium text-[var(--muted)]"
                }
              >
                {line}
              </p>
            ))}
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

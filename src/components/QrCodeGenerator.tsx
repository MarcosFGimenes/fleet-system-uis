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
  const titleLine = "Checklist Digital";

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
  const logoBoxSize = Math.max(44, Math.min(62, Math.round(qrSize * 0.25))); // ~25% do QR (ainda seguro com nível H)

  const larBadgeDataUrl = useMemo(() => {
    if (!larLogoSvgDataUrl) return null;

    // Logo com contorno branco (outline).
    // O filtro "outline" cria uma dilatação branca sólida ao redor do logo para bloquear o QR code.
    // Usamos um threshold no alpha para evitar contornos suaves que pareçam sujos sobre o preto.
    const innerSize = 80;
    const innerOffset = (100 - innerSize) / 2;
    const badgeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <defs>
    <filter id="outline" x="-50%" y="-50%" width="200%" height="200%">
      <!-- 1. Limpa ruído do alpha e binariza para garantir borda dura -->
      <feComponentTransfer in="SourceAlpha" result="HARD_ALPHA">
        <feFuncA type="linear" slope="100" intercept="0"/>
      </feComponentTransfer>
      <!-- 2. Dilata a forma sólida (raio 1.5 ~= 2-3px visuais) -->
      <feMorphology in="HARD_ALPHA" result="DILATED" operator="dilate" radius="1.5"/>
      <!-- 3. Cria o flood branco -->
      <feFlood flood-color="white" flood-opacity="1" result="WHITE"/>
      <!-- 4. Recorta o flood usando a forma dilatada -->
      <feComposite in="WHITE" in2="DILATED" operator="in" result="OUTLINE"/>
      <!-- 5. Compõe: Outline Branco embaixo, Logo Original em cima -->
      <feMerge>
        <feMergeNode in="OUTLINE"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <image filter="url(#outline)" href="${escapeXml(larLogoSvgDataUrl)}" x="${innerOffset}" y="${innerOffset}" width="${innerSize}" height="${innerSize}" preserveAspectRatio="xMidYMid meet"/>
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
    const mappedLines = rawLines.map((line, idx) =>
      idx === 0 ? `Placa: ${line}` : idx === 1 ? `TAG: ${line}` : line,
    );
    const lines = [titleLine, ...mappedLines].filter(Boolean);

    const padding = 24;
    // Espaço vertical entre o QR e o primeiro texto (título).
    // Mantemos mínimo para evitar "vão" no adesivo.
    const gap = lines.length > 0 ? 2 : 0;
    const lineGap = 6;
    const fontFamily =
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

    // Tipografia pensada para adesivo (boa leitura em impressão)
    const fontSizes = lines.map((_, idx) => (idx === 0 ? 20 : idx === 1 ? 20 : 16));
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
        const isTitle = idx === 0;
        const isPrimary = idx === 1;
        const text = `
  <text
    x="${centerX}"
    y="${currentY}"
    text-anchor="middle"
    font-family="${escapeXml(fontFamily)}"
    font-size="${fontSize}"
    font-weight="${isTitle ? 700 : isPrimary ? 700 : 600}"
    fill="${isTitle ? "#111827" : isPrimary ? "#111827" : "#374151"}"
    letter-spacing="${isTitle ? "0.6" : isPrimary ? "0.5" : "0.2"}"
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
          marginSize={2}
          level="H"
          bgColor="#ffffff"
          fgColor="#0b0f19"
          imageSettings={
            larBadgeDataUrl
              ? {
                  src: larBadgeDataUrl,
                  height: logoBoxSize,
                  width: logoBoxSize,
                  excavate: false,
                }
              : undefined
          }
        />
      </div>
      {captionLines.filter(Boolean).length > 0 && (
        <div className="text-center">
          <p className="text-base font-semibold text-[var(--text)] tracking-wide">{titleLine}</p>
          {captionLines
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, idx) => {
              const display = idx === 0 ? `Placa: ${line}` : idx === 1 ? `TAG: ${line}` : line;
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

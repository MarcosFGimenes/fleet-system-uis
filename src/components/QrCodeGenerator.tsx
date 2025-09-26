"use client";

import { QRCodeSVG } from "qrcode.react";

type Props = {
  value: string;
  label?: string;
  fileName?: string;
};

export default function QrCodeGenerator({ value, label, fileName = "qrcode" }: Props) {
  const handleDownload = () => {
    const svg = document.getElementById("qr-svg") as SVGSVGElement | null;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
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
      <div className="bg-white p-3 rounded-md">
        <QRCodeSVG id="qr-svg" value={value} size={192} includeMargin />
      </div>
      {label && <p className="text-sm text-gray-300">{label}</p>}
      <button
        onClick={handleDownload}
        className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700"
      >
        Baixar QR (.svg)
      </button>
    </div>
  );
}

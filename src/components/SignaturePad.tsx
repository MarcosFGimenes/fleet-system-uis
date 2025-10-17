"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  onChange: (value: string | null) => void;
  required?: boolean;
  description?: string;
};

const CANVAS_HEIGHT = 160;

export default function SignaturePad({ label, onChange, required = false, description }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const resetCanvas = useCallback(
    (emitChange = false) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const ratio = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth || canvas.offsetWidth || 600;
      const displayHeight = canvas.clientHeight || CANVAS_HEIGHT;

      if (canvas.width !== displayWidth * ratio || canvas.height !== displayHeight * ratio) {
        canvas.width = displayWidth * ratio;
        canvas.height = displayHeight * ratio;
        context.scale(ratio, ratio);
      }

      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2;
      context.strokeStyle = "#111";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, displayWidth, displayHeight);

      hasStrokeRef.current = false;
      isDrawingRef.current = false;
      setIsEmpty(true);
      if (emitChange) {
        onChangeRef.current(null);
      }
    },
    [],
  );

  useEffect(() => {
    resetCanvas(false);
  }, [resetCanvas]);

  const getContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  };

  const getCoordinates = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = getContext();
    if (!context) return;
    event.preventDefault();
    const { x, y } = getCoordinates(event);
    context.beginPath();
    context.moveTo(x, y);
    isDrawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = getContext();
    if (!context || !isDrawingRef.current) return;
    event.preventDefault();
    const { x, y } = getCoordinates(event);
    context.lineTo(x, y);
    context.stroke();
    if (!hasStrokeRef.current) {
      hasStrokeRef.current = true;
      setIsEmpty(false);
    }
  };

  const finalizeDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    const context = getContext();
    if (!context) return;
    context.closePath();
    isDrawingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture was not set
    }
    if (hasStrokeRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL("image/png");
      onChangeRef.current(dataUrl);
    }
  };

  const clearSignature = () => {
    resetCanvas(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <span className="text-sm font-medium text-[var(--text)]">{label}</span>
          {description && <p className="text-xs text-[var(--hint)]">{description}</p>}
        </div>
        <button
          type="button"
          onClick={clearSignature}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
        >
          Limpar
        </button>
      </div>
      <div
        className={`rounded-md border bg-white ${
          required && isEmpty ? "border-[var(--danger)]" : "border-[var(--border)]"
        }`}
      >
        <canvas
          ref={canvasRef}
          className="w-full"
          height={CANVAS_HEIGHT}
          style={{ touchAction: "none", height: CANVAS_HEIGHT }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finalizeDrawing}
          onPointerLeave={finalizeDrawing}
          onPointerCancel={finalizeDrawing}
        />
      </div>
      {required && isEmpty && (
        <p className="text-xs text-[var(--danger)]">Assinatura obrigatória.</p>
      )}
    </div>
  );
}

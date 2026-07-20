"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, hsvToHex, hexToHsv } from "@/lib/color-utils";

interface ColorWheelProps {
  value: string;
  onChange: (hex: string) => void;
  size?: number;
}

export function ColorWheel({ value, onChange, size = 200 }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const draggingRef = useRef(false);

  const radius = size / 2;
  const wheelRadius = radius - 8;

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(size, size);
    const cx = radius;
    const cy = radius;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;

        if (dist > wheelRadius || dist < wheelRadius * 0.55) {
          imageData.data[idx + 3] = 0;
          continue;
        }

        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle < 0) angle += 360;

        const sat = clamp((dist - wheelRadius * 0.55) / (wheelRadius * 0.45), 0, 1);
        const hex = hsvToHex(angle, sat, hsv.v);
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [size, radius, wheelRadius, hsv.v]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  useEffect(() => {
    setHsv(hexToHsv(value));
  }, [value]);

  const pickFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * size;
      const y = ((clientY - rect.top) / rect.height) * size;
      const dx = x - radius;
      const dy = y - radius;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < wheelRadius * 0.55 || dist > wheelRadius) return;

      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;

      const sat = clamp((dist - wheelRadius * 0.55) / (wheelRadius * 0.45), 0, 1);
      const next = { h: angle, s: sat, v: hsv.v };
      setHsv(next);
      onChange(hsvToHex(next.h, next.s, next.v));
    },
    [size, radius, wheelRadius, hsv.v, onChange]
  );

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === "pointerdown") {
      draggingRef.current = true;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      pickFromEvent(e.clientX, e.clientY);
    }
    if (e.type === "pointerup" || e.type === "pointercancel") {
      draggingRef.current = false;
    }
    if (e.type === "pointermove" && draggingRef.current) {
      pickFromEvent(e.clientX, e.clientY);
    }
  };

  const innerR = wheelRadius * 0.55;
  const outerR = wheelRadius;
  const midR = innerR + (outerR - innerR) * hsv.s;
  const rad = (hsv.h * Math.PI) / 180;
  const dotX = radius + midR * Math.cos(rad);
  const dotY = radius + midR * Math.sin(rad);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="cursor-crosshair rounded-full touch-none"
          onPointerDown={handlePointer}
          onPointerMove={handlePointer}
          onPointerUp={handlePointer}
          onPointerCancel={handlePointer}
        />
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/20"
          style={{
            left: dotX,
            top: dotY,
            backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v),
          }}
        />
      </div>

      <div className="w-full space-y-2">
        <label className="text-xs text-muted-foreground">Яркость</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(hsv.v * 100)}
          onChange={(e) => {
            const v = parseInt(e.target.value) / 100;
            const next = { ...hsv, v };
            setHsv(next);
            onChange(hsvToHex(next.h, next.s, next.v));
          }}
          className="w-full accent-primary"
        />
      </div>
    </div>
  );
}

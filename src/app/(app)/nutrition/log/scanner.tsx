"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o?: { formats: string[] }) => Detector;

/** Camera barcode scanner. Uses the browser's BarcodeDetector when present, ZXing otherwise. */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;
    let raf = 0;

    async function start() {
      const el = video.current;
      if (!el) return;
      try {
        const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Native) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          el.srcObject = stream;
          await el.play();
          const det = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
          const tick = async () => {
            if (stopped) return;
            try {
              const found = await det.detect(el);
              if (found[0]?.rawValue) return onCode(found[0].rawValue);
            } catch {
              // keep trying
            }
            raf = requestAnimationFrame(() => void tick());
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, el, (result) => {
            if (result && !stopped) onCode(result.getText());
          });
        }
      } catch {
        setError("Couldn't open the camera. Allow camera access for this site, or type the barcode instead.");
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800 bg-black">
      <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
        <span className="text-zinc-400">{error ?? "Point at the barcode"}</span>
        <button type="button" onClick={onClose} className="text-zinc-300">
          Close
        </button>
      </div>
    </div>
  );
}

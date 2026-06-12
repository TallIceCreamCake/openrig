import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCcw, X } from 'lucide-react';
import jsQR from 'jsqr';

type DepotScanModalProps = {
  isOpen: boolean;
  busy?: boolean;
  onClose: () => void;
  onDetected: (code: string) => void | Promise<void>;
};

const DepotScanModal: React.FC<DepotScanModalProps> = ({ isOpen, busy = false, onClose, onDetected }) => {
  const [scannerRunning, setScannerRunning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isFallbackScanner, setIsFallbackScanner] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const handlingRef = useRef(false);

  const stopScanner = useCallback(() => {
    setScannerRunning(false);
    setIsFallbackScanner(false);
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleDetectedValue = useCallback(async (rawValue: string) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    stopScanner();
    try {
      await onDetected(rawValue);
    } finally {
      handlingRef.current = false;
    }
  }, [onDetected, stopScanner]);

  const startScanner = useCallback(async () => {
    if (!isOpen || busy) return;
    setScanError(null);

    if (!window.isSecureContext) {
      setScanError('Le scan nécessite une connexion sécurisée (HTTPS ou localhost).');
      return;
    }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      setScanError('Caméra indisponible sur ce navigateur.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.setAttribute('autoplay', 'true');
      video.srcObject = stream;
      await video.play();
      setScannerRunning(true);

      const runFallbackLoop = () => {
        setIsFallbackScanner(true);
        const fallback = () => {
          if (!videoRef.current) return;
          const currentVideo = videoRef.current;
          if (currentVideo.readyState < 2) {
            frameRef.current = requestAnimationFrame(fallback);
            return;
          }

          const canvas =
            canvasRef.current ||
            (() => {
              const newCanvas = document.createElement('canvas');
              canvasRef.current = newCanvas;
              return newCanvas;
            })();

          const width = currentVideo.videoWidth;
          const height = currentVideo.videoHeight;
          if (width === 0 || height === 0) {
            frameRef.current = requestAnimationFrame(fallback);
            return;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
          if (!ctx) {
            frameRef.current = requestAnimationFrame(fallback);
            return;
          }

          ctx.drawImage(currentVideo, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code?.data) {
            void handleDetectedValue(code.data);
            return;
          }
          frameRef.current = requestAnimationFrame(fallback);
        };
        frameRef.current = requestAnimationFrame(fallback);
      };

      const detectorCtor = (window as unknown as {
        BarcodeDetector?: new (config: { formats: string[] }) => {
          detect: (source: CanvasImageSource | HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
        };
      }).BarcodeDetector;

      let detector: InstanceType<NonNullable<typeof detectorCtor>> | null = null;
      if (detectorCtor) {
        try {
          detector = new detectorCtor({ formats: ['qr_code'] });
        } catch (error) {
          console.warn('BarcodeDetector init failed', error);
          detector = null;
        }
      }

      if (detector) {
        const detectLoop = async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector!.detect(videoRef.current);
            if (barcodes?.length) {
              void handleDetectedValue(barcodes[0].rawValue);
              return;
            }
          } catch (error) {
            console.error('Barcode detect error', error);
            runFallbackLoop();
            return;
          }
          frameRef.current = requestAnimationFrame(detectLoop);
        };
        frameRef.current = requestAnimationFrame(detectLoop);
      } else {
        runFallbackLoop();
      }
    } catch (error) {
      console.error('start scanner', error);
      setScanError('Impossible d’accéder à la caméra.');
      stopScanner();
    }
  }, [busy, handleDetectedValue, isOpen, stopScanner]);

  useEffect(() => {
    if (isOpen && !scannerRunning && !busy) {
      void startScanner();
    }
  }, [busy, isOpen, scannerRunning, startScanner]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setScanError(null);
    }
  }, [isOpen, stopScanner]);

  useEffect(() => () => stopScanner(), [stopScanner]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[12040] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={!busy ? onClose : undefined} />
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Scanner un QR code</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopScanner();
                void startScanner();
              }}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Relancer
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-60"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover opacity-90" playsInline autoPlay muted />
          <div className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-white/85 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-medium text-white">
              Analyse en cours...
            </div>
          )}
        </div>

        {isFallbackScanner && (
          <p className="mt-2 text-[11px] text-gray-500">Mode compatibilité scan actif.</p>
        )}
        {scanError && (
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">{scanError}</p>
        )}
      </div>
    </div>
  );
};

export default DepotScanModal;


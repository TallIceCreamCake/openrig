import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import jsQR from 'jsqr';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import {
  fetchEquipmentUnitByCode,
} from '../../utils/equipmentUnitTracking';

type IncidentType = 'Panne' | 'Casse' | 'Vol' | 'Accident' | 'Autre';
type Severity = 'Faible' | 'Moyen' | 'Élevé';

const TYPES: IncidentType[] = ['Panne', 'Casse', 'Vol', 'Accident', 'Autre'];
const SEVERITIES: Severity[] = ['Faible', 'Moyen', 'Élevé'];

const MobileIncidentCreate: React.FC = () => {
  const navigate = useNavigate();

  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [incidentType, setIncidentType] = useState<IncidentType>('Panne');
  const [severity, setSeverity] = useState<Severity>('Faible');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Camera scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerRunning, setScannerRunning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const stopScanner = useCallback(() => {
    setScannerRunning(false);
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  const startScanner = useCallback(async () => {
    setScannerRunning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      await new Promise<void>((resolve) => {
        if (!videoRef.current) { resolve(); return; }
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); resolve(); };
      });
      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
          frameRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { frameRef.current = requestAnimationFrame(tick); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          handleQrDetected(code.data);
        } else {
          frameRef.current = requestAnimationFrame(tick);
        }
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error('Camera error', err);
      setScannerRunning(false);
      toast.error('Impossible d\'accéder à la caméra');
    }
  }, []);

  const handleQrDetected = useCallback(async (raw: string) => {
    stopScanner();
    try {
      const unit = await fetchEquipmentUnitByCode(raw);
      if (unit) {
        const { data } = await supabase.from('equipment').select('id, name').eq('id', unit.equipment_id).single();
        if (data) {
          setEquipmentId((data as any).id);
          setEquipmentName((data as any).name || '');
          setScannerOpen(false);
          toast.success('Équipement identifié');
          return;
        }
      }
      toast.error('QR non reconnu');
    } catch (err) {
      console.error('QR lookup error', err);
      toast.error('Erreur lors de la lecture du QR');
    }
  }, [stopScanner]);

  const openScanner = () => {
    setScannerOpen(true);
    startScanner();
  };

  const closeScanner = () => {
    stopScanner();
    setScannerOpen(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('equipment_incidents').insert({
        title: `${incidentType} - ${equipmentName || 'Équipement non spécifié'}`,
        incident_type: incidentType.toLowerCase(),
        severity: severity === 'Élevé' ? 'high' : severity === 'Moyen' ? 'medium' : 'low',
        description: description.trim() || null,
        status: 'open',
        equipment_id: equipmentId || null,
      });
      if (error) throw error;
      toast.success('Sinistre déclaré');
      navigate('/m/');
    } catch (err) {
      console.error('Incident insert error', err);
      toast.error('Erreur lors de la déclaration');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobileLayout>
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="h-10 w-10 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shrink-0"
          aria-label="Retour"
        >
          <X className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Déclarer un sinistre</h1>
      </div>

      <div className="flex flex-col gap-6">
        {/* Equipment */}
        <div>
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Équipement</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={equipmentName}
              onChange={(e) => { setEquipmentName(e.target.value); setEquipmentId(null); }}
              placeholder="Nom de l'équipement"
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              type="button"
              onClick={openScanner}
              className="h-12 w-12 flex items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 shrink-0"
              aria-label="Scanner QR"
            >
              <ScanLine className="h-5 w-5" />
            </button>
          </div>
          {equipmentId && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Équipement identifié via QR
            </div>
          )}
        </div>

        {/* Type */}
        <div>
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Type d'incident</p>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setIncidentType(t)}
                className={`px-4 py-2.5 rounded-xl border font-medium text-sm transition-colors ${
                  incidentType === t ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-300 text-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div>
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Gravité</p>
          <div className="flex gap-2">
            {SEVERITIES.map((s) => {
              const color =
                s === 'Élevé' ? (severity === s ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-300 text-gray-700') :
                s === 'Moyen' ? (severity === s ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-300 text-gray-700') :
                (severity === s ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-300 text-gray-700');
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`flex-1 py-3 rounded-xl border font-medium text-sm transition-colors ${color}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez l'incident..."
            rows={4}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3.5 bg-red-600 text-white rounded-xl font-semibold text-base disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <AlertTriangle className="h-5 w-5" />
          {submitting ? 'Déclaration...' : 'Déclarer le sinistre'}
        </button>
      </div>

      {/* Scanner modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black">
            <span className="text-white font-semibold">Scanner l'équipement</span>
            <button
              type="button"
              onClick={closeScanner}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Fermer le scanner"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 relative">
            <video
              ref={videoRef}
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-56 border-2 border-white rounded-2xl opacity-70" />
            </div>
          </div>
          <div className="px-4 py-4 bg-black">
            <p className="text-center text-white/70 text-sm">Pointez la caméra vers le QR code de l'équipement</p>
          </div>
        </div>
      )}
    </MobileLayout>
  );
};

export default MobileIncidentCreate;

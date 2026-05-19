import React from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import {
  EQUIPMENT_IMAGE_ACCEPT,
  MAX_EQUIPMENT_IMAGE_SIZE,
  EquipmentImageUploadScope,
  getEquipmentImageUploadErrorMessage,
  uploadEquipmentImage,
} from '../../utils/equipmentImageUpload';

type Props = {
  value: string;
  onChange: (value: string) => void;
  scope?: EquipmentImageUploadScope;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  helpText?: string;
  previewLabel?: string;
  emptyLabel?: string;
  uploadLabel?: string;
  uploadingLabel?: string;
  removeLabel?: string;
  previewHeightClassName?: string;
};

const EquipmentImageField: React.FC<Props> = ({
  value,
  onChange,
  scope = 'equipment',
  disabled = false,
  label = "URL de l'image",
  placeholder = 'https://exemple.com/image.jpg',
  helpText = "Collez une URL publique ou importez une image (max. 5 Mo).",
  previewLabel = 'Apercu',
  emptyLabel = 'Aucune image',
  uploadLabel = 'Importer une image',
  uploadingLabel = 'Import...',
  removeLabel = "Retirer l'image",
  previewHeightClassName = 'h-40',
}) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const replacePreviewUrl = React.useCallback((nextUrl: string | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }, []);

  React.useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    replacePreviewUrl(URL.createObjectURL(file));
    setUploading(true);

    try {
      const uploadedUrl = await uploadEquipmentImage(file, scope);
      onChange(uploadedUrl);
      replacePreviewUrl(null);
    } catch (err) {
      replacePreviewUrl(null);
      setError(getEquipmentImageUploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const resolvedPreview = previewUrl || value.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <input
          type="url"
          value={value}
          onChange={(event) => {
            setError(null);
            onChange(event.target.value);
          }}
          placeholder={placeholder}
          disabled={disabled || uploading}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? uploadingLabel : uploadLabel}
          </button>
          {value.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                replacePreviewUrl(null);
                onChange('');
              }}
              disabled={disabled || uploading}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              {removeLabel}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={EQUIPMENT_IMAGE_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || uploading}
        />
        <p className="text-xs text-gray-500">
          {helpText} Taille max: {(MAX_EQUIPMENT_IMAGE_SIZE / (1024 * 1024)).toFixed(0)} Mo.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">{previewLabel}</label>
        <div className={`${previewHeightClassName} w-full overflow-hidden rounded-md border border-dashed border-gray-300 bg-gray-50`}>
          {resolvedPreview ? (
            <img src={resolvedPreview} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              {emptyLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentImageField;

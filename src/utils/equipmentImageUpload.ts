export type EquipmentImageUploadScope = 'equipment' | 'pack' | 'accessory';

export type EquipmentImageUploadErrorCode =
  | 'invalid_type'
  | 'too_large'
  | 'read_failed'
  | 'upload_failed'
  | 'missing_url';

export class EquipmentImageUploadError extends Error {
  code: EquipmentImageUploadErrorCode;

  constructor(code: EquipmentImageUploadErrorCode, message?: string) {
    super(message || code);
    this.name = 'EquipmentImageUploadError';
    this.code = code;
  }
}

export const MAX_EQUIPMENT_IMAGE_SIZE = 5 * 1024 * 1024;
export const EQUIPMENT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml';

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result.split(',').pop() : null;
    if (!result) {
      reject(new EquipmentImageUploadError('read_failed'));
      return;
    }
    resolve(result);
  };
  reader.onerror = () => reject(new EquipmentImageUploadError('read_failed'));
  reader.readAsDataURL(file);
});

export const validateEquipmentImageFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    throw new EquipmentImageUploadError('invalid_type');
  }
  if (file.size > MAX_EQUIPMENT_IMAGE_SIZE) {
    throw new EquipmentImageUploadError('too_large');
  }
};

export const uploadEquipmentImage = async (
  file: File,
  scope: EquipmentImageUploadScope = 'equipment',
) => {
  validateEquipmentImageFile(file);

  const data = await fileToBase64(file);
  const response = await fetch('/api/equipment/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      data,
      scope,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new EquipmentImageUploadError(
      'upload_failed',
      typeof payload?.error === 'string' && payload.error.length > 0
        ? payload.error
        : "Impossible d'importer l'image.",
    );
  }

  const url = payload?.url;
  if (typeof url !== 'string' || url.length === 0) {
    throw new EquipmentImageUploadError('missing_url');
  }

  return url;
};

export const getEquipmentImageUploadErrorMessage = (error: unknown) => {
  if (error instanceof EquipmentImageUploadError) {
    if (error.code === 'invalid_type') return 'Seuls les fichiers image sont autorises.';
    if (error.code === 'too_large') return 'Image trop volumineuse (max. 5 Mo).';
    if (error.code === 'read_failed') return "Impossible de lire l'image.";
    if (error.code === 'missing_url') return "L'URL publique de l'image est introuvable.";
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Impossible d'importer l'image.";
};

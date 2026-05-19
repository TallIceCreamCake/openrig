import { DocumentTableDesign } from './documentDesign';

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result);
    } else {
      reject(new Error('invalid_result'));
    }
  };
  reader.onerror = () => reject(reader.error || new Error('read_error'));
  reader.readAsDataURL(blob);
});

const extractSvgTextFromDataUrl = (dataUrl: string): string | null => {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return null;
  const header = dataUrl.slice(0, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);
  try {
    if (header.includes(';base64')) {
      return atob(data);
    }
    return decodeURIComponent(data);
  } catch (err) {
    console.warn('svg data url decode failed', err);
    return null;
  }
};

const parseSvgSize = (svgText: string): { width: number; height: number } => {
  const size = (value?: string | null) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const widthMatch = svgText.match(/width=["']?([0-9.]+)(px)?["']/i);
  const heightMatch = svgText.match(/height=["']?([0-9.]+)(px)?["']/i);
  const viewBoxMatch = svgText.match(/viewBox=["']?([0-9.\s-]+)["']/i);
  const width = size(widthMatch?.[1]) || (viewBoxMatch ? size(viewBoxMatch[1].trim().split(/\s+/)[2]) : null);
  const height = size(heightMatch?.[1]) || (viewBoxMatch ? size(viewBoxMatch[1].trim().split(/\s+/)[3]) : null);
  return {
    width: width || 512,
    height: height || 512,
  };
};

const rasterizeSvgText = (svgText: string): Promise<string | null> => new Promise((resolve) => {
  const { width, height } = parseSvgSize(svgText);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    } catch (err) {
      console.warn('svg rasterize failed', err);
      resolve(null);
    }
  };
  image.onerror = () => resolve(null);
  image.src = svgUrl;
});

const fetchPublicImageDataUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(`/api/system/public-image-data?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const payload = await res.json().catch(() => ({}));
    return typeof payload?.dataUrl === 'string' ? payload.dataUrl : null;
  } catch (err) {
    console.warn('public image data url fetch failed', err);
    return null;
  }
};

const ensureDataUrl = async (src?: string | null, options: { allowOriginal?: boolean } = {}): Promise<string | null> => {
  const trimmed = src?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/svg+xml')) {
    const svgText = extractSvgTextFromDataUrl(trimmed);
    if (!svgText) return trimmed;
    const rasterized = await rasterizeSvgText(svgText);
    return rasterized || (options.allowOriginal ? trimmed : null);
  }
  if (trimmed.startsWith('data:')) return trimmed;
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && trimmed.startsWith('http://')) {
    const serverDataUrl = await fetchPublicImageDataUrl(trimmed);
    return serverDataUrl || null;
  }
  try {
    const res = await fetch(trimmed);
    if (!res.ok) return options.allowOriginal ? trimmed : null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('image/svg+xml')) {
      const svgText = await res.text();
      const rasterized = await rasterizeSvgText(svgText);
      return rasterized || (options.allowOriginal ? trimmed : null);
    }
    const blob = await res.blob();
    return await toDataUrl(blob);
  } catch (err) {
    console.warn('document image fetch failed', err);
    return options.allowOriginal ? trimmed : null;
  }
};

export const resolveDocumentDesignImages = async (
  design: DocumentTableDesign,
  fallbackLogoUrl?: string | null,
): Promise<DocumentTableDesign> => {
  const primaryLogo = design.logoImageUrl?.trim() || '';
  const fallbackLogo = fallbackLogoUrl?.trim() || '';
  const [resolvedLogoPrimary, resolvedBackground] = await Promise.all([
    ensureDataUrl(primaryLogo, { allowOriginal: fallbackLogo.length === 0 }),
    ensureDataUrl(design.backgroundImageUrl),
  ]);
  const resolvedLogo = resolvedLogoPrimary || (fallbackLogo ? await ensureDataUrl(fallbackLogo) : null);

  return {
    ...design,
    logoImageUrl: resolvedLogo || design.logoImageUrl,
    backgroundImageUrl: resolvedBackground || design.backgroundImageUrl,
  };
};

export const toPdfImageSource = (src?: string | null): string | null => {
  const trimmed = src?.trim();
  if (!trimmed) return null;
  return trimmed;
};

let cachedLogoDataUrl: string | null = null;
let cachedLogoPromise: Promise<string | null> | null = null;

export const fetchCompanyLogoDataUrl = async (options: { force?: boolean } = {}): Promise<string | null> => {
  if (!options.force && cachedLogoDataUrl) return cachedLogoDataUrl;
  if (!options.force && cachedLogoPromise) return cachedLogoPromise;

  cachedLogoPromise = (async () => {
    try {
      const res = await fetch('/api/system/company-logo-data');
      if (!res.ok) return null;
      const payload = await res.json().catch(() => ({}));
      const dataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl : null;
      cachedLogoDataUrl = dataUrl;
      return dataUrl;
    } catch (err) {
      console.warn('company logo data url fetch failed', err);
      return null;
    } finally {
      cachedLogoPromise = null;
    }
  })();

  return cachedLogoPromise;
};

export const invalidateCompanyLogoDataUrl = () => {
  cachedLogoDataUrl = null;
  cachedLogoPromise = null;
};

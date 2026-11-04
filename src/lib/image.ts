import { UPLOAD } from '../config';

/**
 * Validates and shrinks an image in the browser before upload, so 300 people's
 * screenshots don't blow up storage or phone data plans.
 * Returns a JPEG data URL. Throws a friendly Error for unsupported files.
 */
export async function prepareImage(file: File): Promise<string> {
  const okType = file.type.startsWith('image/') && (UPLOAD.accept as readonly string[]).some((t) => t === file.type || file.type === 'image/heif');
  if (!okType) throw new Error('Unsupported file. Please upload a JPG, PNG or WebP image.');
  if (file.size > UPLOAD.maxBytes) throw new Error(`That image is too big (max ${Math.round(UPLOAD.maxBytes / 1024 / 1024)} MB).`);

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('We couldn’t read that image. Try a screenshot in JPG or PNG.'));
      i.src = url;
    });
    const scale = Math.min(1, UPLOAD.maxDimension / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser couldn’t process the image.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', UPLOAD.jpegQuality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

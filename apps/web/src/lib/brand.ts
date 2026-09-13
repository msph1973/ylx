export interface BrandInput {
  logoUrl?: string;
  accentColor?: string;
}

export interface BrandValidationResult {
  ok: boolean;
  error?: string;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const GALLERY_BACKGROUND = "#0a0a0a";
const MIN_CONTRAST = 4.5;

function channelLuminance(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** Pure WCAG relative-luminance contrast ratio in [1, 21]. Order-independent. */
export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function validateBrand(brand: BrandInput): BrandValidationResult {
  if (brand.accentColor !== undefined) {
    if (!HEX_COLOR_RE.test(brand.accentColor)) {
      return { ok: false, error: "accentColor must be #rrggbb" };
    }
    if (contrastRatio(brand.accentColor, GALLERY_BACKGROUND) < MIN_CONTRAST) {
      return { ok: false, error: "accentColor contrast below WCAG AA (4.5)" };
    }
  }
  if (brand.logoUrl !== undefined) {
    let u: URL;
    try {
      u = new URL(brand.logoUrl);
    } catch {
      return { ok: false, error: "logoUrl must be absolute URL" };
    }
    if (u.protocol !== "https:") {
      return { ok: false, error: "logoUrl must be https" };
    }
  }
  return { ok: true };
}

import type { FootprintFit } from './printerProfiles';

/** A closed frame made from N segments has N seams; each bowtie seam needs one key. */
export function bowtieKeyQuantityForClosedFrame(framePartCount: number): number {
  if (!Number.isSafeInteger(framePartCount) || framePartCount < 1) {
    throw new RangeError('A closed frame must contain at least one printable segment.');
  }
  return framePartCount;
}

export function createBowtieKeyManifestEntry(
  framePartCount: number,
  file: string,
  fit: FootprintFit
): {
  name: string;
  file: string;
  quantity: number;
  isReusableTemplate: true;
  footprintMm: { x: number; y: number };
  fitsSelectedBed: boolean;
  bedOrientation: FootprintFit['orientation'];
} {
  return {
    name: 'Bowtie key',
    file,
    quantity: bowtieKeyQuantityForClosedFrame(framePartCount),
    isReusableTemplate: true,
    footprintMm: { x: Number(fit.width.toFixed(2)), y: Number(fit.length.toFixed(2)) },
    fitsSelectedBed: fit.fits,
    bedOrientation: fit.orientation
  };
}

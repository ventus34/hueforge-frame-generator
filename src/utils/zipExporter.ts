export interface ZipEntry {
  name: string;
  data: Uint8Array | ArrayBuffer | string;
}

const encoder = new TextEncoder();
const MAX_ZIP32_VALUE = 0xffffffff;

function bytesOf(data: ZipEntry['data']): Uint8Array {
  if (typeof data === 'string') return encoder.encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

function write16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < table.length; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Creates a standards-compliant ZIP archive with stored (uncompressed) entries. */
export function createZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length === 0 || entries.length > 0xffff) throw new RangeError('ZIP must contain between 1 and 65535 files.');
  const names = new Set<string>();
  const files = entries.map((entry) => {
    const name = entry.name.replace(/\\/g, '/');
    if (!name || name.startsWith('/') || name.includes('\0') || name.includes(':') ||
        name.split('/').some((part) => part === '..' || part === '.' || part === '')) {
      throw new RangeError(`Unsafe ZIP entry name: ${entry.name}`);
    }
    if (names.has(name)) throw new RangeError(`Duplicate ZIP entry name: ${name}`);
    names.add(name);
    const nameBytes = encoder.encode(name);
    if (nameBytes.length > 0xffff) throw new RangeError('ZIP entry name is too long.');
    const data = bytesOf(entry.data);
    if (data.byteLength > MAX_ZIP32_VALUE) throw new RangeError('ZIP entry exceeds the ZIP32 size limit.');
    return { name, nameBytes, data, crc: crc32(data), offset: 0 };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const file of files) {
    file.offset = localSize;
    localSize += 30 + file.nameBytes.length + file.data.length;
    centralSize += 46 + file.nameBytes.length;
  }
  const totalSize = localSize + centralSize + 22;
  if (!Number.isSafeInteger(totalSize) || totalSize > MAX_ZIP32_VALUE) throw new RangeError('ZIP archive exceeds the ZIP32 size limit.');

  const archive = new Uint8Array(totalSize);
  const view = new DataView(archive.buffer);
  let offset = 0;
  for (const file of files) {
    write32(view, offset, 0x04034b50);
    write16(view, offset + 4, 20);
    write16(view, offset + 6, 0x0800); // UTF-8 file name
    write16(view, offset + 8, 0); // stored
    write16(view, offset + 10, 0);
    write16(view, offset + 12, 0x21); // 1980-01-01
    write32(view, offset + 14, file.crc);
    write32(view, offset + 18, file.data.length);
    write32(view, offset + 22, file.data.length);
    write16(view, offset + 26, file.nameBytes.length);
    write16(view, offset + 28, 0);
    offset += 30;
    archive.set(file.nameBytes, offset);
    offset += file.nameBytes.length;
    archive.set(file.data, offset);
    offset += file.data.length;
  }
  const centralOffset = offset;
  for (const file of files) {
    write32(view, offset, 0x02014b50);
    write16(view, offset + 4, 20);
    write16(view, offset + 6, 20);
    write16(view, offset + 8, 0x0800);
    write16(view, offset + 10, 0);
    write16(view, offset + 12, 0);
    write16(view, offset + 14, 0x21);
    write32(view, offset + 16, file.crc);
    write32(view, offset + 20, file.data.length);
    write32(view, offset + 24, file.data.length);
    write16(view, offset + 28, file.nameBytes.length);
    write16(view, offset + 30, 0);
    write16(view, offset + 32, 0);
    write16(view, offset + 34, 0);
    write16(view, offset + 36, 0);
    write32(view, offset + 38, 0);
    write32(view, offset + 42, file.offset);
    offset += 46;
    archive.set(file.nameBytes, offset);
    offset += file.nameBytes.length;
  }
  const centralLength = offset - centralOffset;
  write32(view, offset, 0x06054b50);
  write16(view, offset + 4, 0);
  write16(view, offset + 6, 0);
  write16(view, offset + 8, files.length);
  write16(view, offset + 10, files.length);
  write32(view, offset + 12, centralLength);
  write32(view, offset + 16, centralOffset);
  write16(view, offset + 20, 0);
  return archive;
}

export function downloadZip(entries: ZipEntry[], filename: string): void {
  const archive = createZip(entries);
  const blobBytes = new ArrayBuffer(archive.byteLength);
  new Uint8Array(blobBytes).set(archive);
  const blob = new Blob([blobBytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

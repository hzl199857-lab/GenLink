'use client';

import {
  inferExtension,
  readImageOutputBlob,
  sanitizeFileStem,
} from '@/lib/project-storage';

export type ZipImageDownloadItem = {
  url: string;
  fileName?: string;
  title?: string;
  format?: string;
};

const ZIP_FILE_COMMENT = new Uint8Array(0);
const textEncoder = new TextEncoder();
const crcTable = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function sanitizeZipPathPart(value: string): string {
  return sanitizeFileStem(value).replace(/\.+/g, '-');
}

function getFileNameParts(fileName?: string): { stem: string; extension?: string } {
  const trimmed = fileName?.trim();

  if (!trimmed) {
    return { stem: 'image' };
  }

  const slashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const baseName = trimmed.slice(slashIndex + 1);
  const dotIndex = baseName.lastIndexOf('.');

  if (dotIndex > 0 && dotIndex < baseName.length - 1) {
    return {
      stem: baseName.slice(0, dotIndex),
      extension: baseName.slice(dotIndex + 1),
    };
  }

  return { stem: baseName };
}

function getZipEntryName(
  item: ZipImageDownloadItem,
  blob: Blob,
  index: number,
  usedNames: Set<string>,
): string {
  const parts = getFileNameParts(item.fileName);
  const stem = sanitizeZipPathPart(parts.stem || item.title || `image-${index + 1}`);
  const extension = sanitizeZipPathPart(parts.extension || inferExtension(item.format, blob.type));
  const baseName = `${stem || `image-${index + 1}`}.${extension || 'png'}`;
  let candidate = baseName;
  let duplicateIndex = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${duplicateIndex}.${extension || 'png'}`;
    duplicateIndex += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function makeLocalFileHeader(fileNameBytes: Uint8Array, crc: number, size: number): Uint8Array {
  const header = new Uint8Array(30 + fileNameBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 0x0800);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, 0);
  writeUint32(view, 14, crc);
  writeUint32(view, 18, size);
  writeUint32(view, 22, size);
  writeUint16(view, 26, fileNameBytes.length);
  writeUint16(view, 28, 0);
  header.set(fileNameBytes, 30);

  return header;
}

function makeCentralDirectoryHeader(
  fileNameBytes: Uint8Array,
  crc: number,
  size: number,
  localHeaderOffset: number,
): Uint8Array {
  const header = new Uint8Array(46 + fileNameBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, 0x0800);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, 0);
  writeUint16(view, 14, 0);
  writeUint32(view, 16, crc);
  writeUint32(view, 20, size);
  writeUint32(view, 24, size);
  writeUint16(view, 28, fileNameBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, localHeaderOffset);
  header.set(fileNameBytes, 46);

  return header;
}

function makeEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Uint8Array {
  const header = new Uint8Array(22 + ZIP_FILE_COMMENT.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralDirectorySize);
  writeUint32(view, 16, centralDirectoryOffset);
  writeUint16(view, 20, ZIP_FILE_COMMENT.length);
  header.set(ZIP_FILE_COMMENT, 22);

  return header;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function downloadImagesAsZip(
  items: ZipImageDownloadItem[],
  zipFileName: string,
): Promise<number> {
  if (items.length === 0) {
    throw new Error('组内没有可下载的图片');
  }

  const parts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  const usedNames = new Set<string>();
  let offset = 0;

  for (const [index, item] of items.entries()) {
    const blob = await readImageOutputBlob(item.url, item.fileName || item.title);
    const data = new Uint8Array(await blob.arrayBuffer());

    if (data.byteLength > 0xffffffff) {
      throw new Error('单张图片过大，无法写入 ZIP');
    }

    const entryName = getZipEntryName(item, blob, index, usedNames);
    const fileNameBytes = textEncoder.encode(entryName);
    const checksum = crc32(data);
    const localHeader = makeLocalFileHeader(fileNameBytes, checksum, data.byteLength);
    const centralHeader = makeCentralDirectoryHeader(
      fileNameBytes,
      checksum,
      data.byteLength,
      offset,
    );

    parts.push(localHeader, data);
    centralDirectoryParts.push(centralHeader);
    offset += localHeader.byteLength + data.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectoryParts.reduce(
    (total, part) => total + part.byteLength,
    0,
  );
  const endHeader = makeEndOfCentralDirectory(
    items.length,
    centralDirectorySize,
    centralDirectoryOffset,
  );
  const zipBlob = new Blob(
    [...parts, ...centralDirectoryParts, endHeader].map(toBlobPart),
    {
    type: 'application/zip',
    },
  );
  const safeZipFileName = `${sanitizeZipPathPart(zipFileName) || 'images'}.zip`;

  downloadBlob(zipBlob, safeZipFileName);
  return items.length;
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { getLocalImageDirectory } from '@/lib/image-host';

export const runtime = 'nodejs';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

interface RouteContext {
  params: Promise<{
    fileName: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { fileName } = await context.params;
  const decodedFileName = decodeURIComponent(fileName);

  if (
    !decodedFileName ||
    decodedFileName.includes('/') ||
    decodedFileName.includes('\\')
  ) {
    return NextResponse.json({ ok: false, error: 'Invalid file name' }, { status: 400 });
  }

  const absolutePath = path.join(getLocalImageDirectory(), decodedFileName);

  try {
    const bytes = await readFile(absolutePath);
    const extension = path.extname(decodedFileName).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'File not found' }, { status: 404 });
  }
}

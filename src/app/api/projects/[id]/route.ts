import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
}

export function PUT() {
  return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
}

export function DELETE() {
  return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
}

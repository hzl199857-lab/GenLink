import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { dbToSnapshot, snapshotToDb } from "@/lib/project-mapper";
import type { ProjectSnapshot } from "@/types/canvas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface UpdateProjectBody {
  snapshot?: unknown;
}

function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    Array.isArray(record.nodes) &&
    Array.isArray(record.edges) &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: { nodes: true, edges: true },
    });

    if (!project) {
      return NextResponse.json(
        { ok: false, error: "Project not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      snapshot: dbToSnapshot(project, project.nodes, project.edges),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid node data JSON") {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateProjectBody;

    if (!isProjectSnapshot(body.snapshot)) {
      return NextResponse.json(
        { ok: false, error: "Invalid snapshot" },
        { status: 400 },
      );
    }

    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Project not found" },
        { status: 404 },
      );
    }

    const mapped = snapshotToDb({
      ...body.snapshot,
      id,
    });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.canvasEdge.deleteMany({ where: { projectId: id } });
      await tx.canvasNode.deleteMany({ where: { projectId: id } });

      await tx.project.update({
        where: { id },
        data: {
          name: mapped.project.name,
          nodes: {
            create: mapped.nodes.map((node) => ({
              id: node.id,
              type: node.type,
              positionX: node.positionX,
              positionY: node.positionY,
              data: node.data,
            })),
          },
          edges: {
            create: mapped.edges.map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
            })),
          },
        },
      });
    });

    const updated = await prisma.project.findUnique({
      where: { id },
      include: { nodes: true, edges: true },
    });

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Project not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      snapshot: dbToSnapshot(updated, updated.nodes, updated.edges),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid node data JSON") {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Project not found" },
        { status: 404 },
      );
    }

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { snapshotToDb } from "@/lib/project-mapper";
import type { ProjectSnapshot } from "@/types/canvas";

export const runtime = "nodejs";

interface CreateProjectBody {
  name?: unknown;
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

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      projects: projects.map((project: {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateProjectBody;
    const name = typeof body.name === "string" && body.name.trim() ? body.name : "Untitled";

    if (body.snapshot !== undefined && !isProjectSnapshot(body.snapshot)) {
      return NextResponse.json(
        { ok: false, error: "Invalid snapshot" },
        { status: 400 },
      );
    }

    if (body.snapshot && body.snapshot.name.trim() === "") {
      body.snapshot.name = name;
    }

    const created = body.snapshot
      ? await (() => {
          const mapped = snapshotToDb({
            ...body.snapshot,
            name: body.snapshot.name.trim() || name,
          });

          return prisma.project.create({
            data: {
              id: mapped.project.id,
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
            select: {
              id: true,
              name: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        })()
      : await prisma.project.create({
          data: { name },
          select: {
            id: true,
            name: true,
            createdAt: true,
            updatedAt: true,
          },
        });

    return NextResponse.json({
      ok: true,
      project: {
        id: created.id,
        name: created.name,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

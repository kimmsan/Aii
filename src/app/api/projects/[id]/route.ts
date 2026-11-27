import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cleanupProjectFiles } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const project = await db.project.findUnique({
      where: { id },
      include: {
        segments: { orderBy: { idx: "asc" } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: "រកមិនឃើញគម្រោង" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (err) {
    console.error("[api/projects/:id] failed:", err);
    return NextResponse.json({ error: "មិនអាចទាញយកព័ត៌មានគម្រោងបានទេ" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "រកមិនឃើញគម្រោង" }, { status: 404 });
    }
    await db.project.delete({ where: { id } });
    await cleanupProjectFiles(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/projects/:id] delete failed:", err);
    return NextResponse.json({ error: "មិនអាចលុបគម្រោងបានទេ" }, { status: 500 });
  }
}

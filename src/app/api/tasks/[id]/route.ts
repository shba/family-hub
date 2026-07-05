import { NextRequest, NextResponse } from "next/server";
import { toggleTask, confirmTask, deleteTask } from "@/lib/queries";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idn = Number(id);
  if (!Number.isFinite(idn)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.action === "confirm") confirmTask(idn);
  else toggleTask(idn); // default action = toggle done
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteTask(Number(id));
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { toggleGrocery, deleteGrocery } from "@/lib/queries";

export const runtime = "nodejs";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  toggleGrocery(Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteGrocery(Number(id));
  return NextResponse.json({ ok: true });
}

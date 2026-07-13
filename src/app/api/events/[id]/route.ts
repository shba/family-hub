import { NextRequest, NextResponse } from "next/server";
import { confirmEvent, deleteEvent, setEventParticipants } from "@/lib/queries";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body?.participants)) {
    setEventParticipants(Number(id), body.participants.map(Number));
  } else {
    confirmEvent(Number(id));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteEvent(Number(id));
  return NextResponse.json({ ok: true });
}

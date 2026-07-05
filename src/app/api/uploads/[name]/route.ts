import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { dataDir } from "@/lib/store";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const safe = path.basename(name); // prevent path traversal
  const file = path.join(dataDir, "uploads", safe);
  if (!fs.existsSync(file)) {
    return new NextResponse("not found", { status: 404 });
  }
  const buf = fs.readFileSync(file);
  const ext = path.extname(safe).slice(1).toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

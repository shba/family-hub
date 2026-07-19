import { NextRequest, NextResponse } from "next/server";

// Protects the whole app with HTTP Basic Auth when APP_USERNAME/APP_PASSWORD
// are set. Locally (no env vars) auth is disabled so dev stays frictionless.
// The WhatsApp gateway can bypass auth on /api/extract using a shared token.

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  // Calendar (ICS) feed is fetched by Google with no auth header; it guards
  // itself with a token query param, so bypass Basic Auth here.
  if (req.nextUrl.pathname.startsWith("/api/calendar")) {
    return NextResponse.next();
  }

  const token = process.env.API_TOKEN;
  if (token && req.nextUrl.pathname.startsWith("/api/extract")) {
    if (req.headers.get("x-api-token") === token) {
      return NextResponse.next();
    }
  }

  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.next(); // auth not configured -> open (local dev)
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const [u, p] = atob(header.slice(6)).split(":");
      if (u === user && p === pass) {
        return NextResponse.next();
      }
    } catch {
      /* fall through to 401 */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Family Hub"' },
  });
}

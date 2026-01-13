import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // صفحات مسموح بها بدون تسجيل
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  const authCookie = req.cookies.get("auth")?.value;

  // لو مش مسجل دخول -> حوله للّوجين
  if (!authCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// حدد المسارات التي يطبق عليها
export const config = {
  matcher: ["/((?!api).*)"],
};

import { NextResponse } from "next/server";
import { uncachedAuth } from "~/server/auth";

// -----------------------------------------------------------------------
// Role → route mapping
// Built from the centralised role-routing module (duplicated here because
// middleware runs on the Edge runtime and cannot import from ~/lib).
// -----------------------------------------------------------------------

function getHomeByRole(role: string): string {
  switch (role) {
    case "ADMIN":
    case "OPERATOR":
      return "/dashboard";
    case "FREELANCE":
      return "/my-missions";
    case "CLIENT_RETAINER":
    case "CLIENT_STATIC":
      return "/cockpit";
    default:
      // Authenticated users with unknown/missing role go to root,
      // where auth() will refresh the role from DB and redirect.
      // Sending them to /login would create a redirect loop.
      return "/";
  }
}

const ROLE_ROUTES: Record<string, string[]> = {
  // General dashboard
  "/dashboard": ["ADMIN", "OPERATOR"],
  // Operator-only portals
  "/impulsion": ["ADMIN", "OPERATOR"],
  "/pilotis": ["ADMIN", "OPERATOR"],
  "/serenite": ["ADMIN", "OPERATOR"],
  "/glory": ["ADMIN", "OPERATOR"],
  "/tarsis": ["ADMIN", "OPERATOR"],
  "/guilde": ["ADMIN", "OPERATOR"],
  // Freelance (+ ADMIN preview)
  "/my-missions": ["ADMIN", "FREELANCE"],
  "/my-finances": ["ADMIN", "FREELANCE"],
  "/my-briefs": ["ADMIN", "FREELANCE"],
  "/upload": ["ADMIN", "FREELANCE"],
  "/profile": ["ADMIN", "FREELANCE"],
  // Client (+ ADMIN preview)
  "/cockpit": ["ADMIN", "CLIENT_RETAINER", "CLIENT_STATIC"],
  "/oracle": ["ADMIN", "CLIENT_RETAINER", "CLIENT_STATIC"],
  "/my-documents": ["ADMIN", "CLIENT_RETAINER", "CLIENT_STATIC"],
  "/requests": ["ADMIN", "CLIENT_RETAINER", "CLIENT_STATIC"],
  // Brand OS (retainer portal)
  "/os": ["ADMIN", "OPERATOR", "CLIENT_RETAINER"],
};

// Use auth() as middleware — this is the official Auth.js v5 approach.
// Unlike getToken(), auth() correctly decrypts the JWT using the same
// config (cookie name, encryption, secret) as the sign-in flow.
export default uncachedAuth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Not logged in → redirect to login
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const userRole = session.user?.role ?? "";

  // Check role-protected routes
  for (const [route, allowedRoles] of Object.entries(ROLE_ROUTES)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      if (!allowedRoles.includes(userRole)) {
        // Redirect to the user's actual home
        return NextResponse.redirect(new URL(getHomeByRole(userRole), req.url));
      }
      break;
    }
  }

  return NextResponse.next();
});

export const config = {
  // Run middleware on all protected route prefixes
  matcher: [
    // General dashboard
    "/dashboard/:path*",
    // Operator portals
    "/impulsion/:path*",
    "/pilotis/:path*",
    "/serenite/:path*",
    "/glory/:path*",
    "/tarsis/:path*",
    "/guilde/:path*",
    // Freelance routes
    "/my-missions/:path*",
    "/my-finances/:path*",
    "/my-briefs/:path*",
    "/upload/:path*",
    "/profile/:path*",
    // Client routes
    "/cockpit/:path*",
    "/oracle/:path*",
    "/my-documents/:path*",
    "/requests/:path*",
    // Brand OS
    "/os/:path*",
  ],
};

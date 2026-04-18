import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

export default convexAuthNextjsMiddleware();

export const config = {
  // Run on every request except Next.js internals and static assets.
  // This is the standard matcher recommended by Convex Auth — it ensures
  // the auth cookie is read/refreshed on navigation so server components
  // see a consistent session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

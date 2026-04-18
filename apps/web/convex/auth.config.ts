/**
 * Auth configuration read by Convex at startup.
 *
 * CONVEX_SITE_URL must point to your deployment's `.convex.site` URL.
 * Convex Auth sets this automatically when you run `npx convex dev`, but if
 * you ever need to override it, set it with:
 *   npx convex env set CONVEX_SITE_URL https://<deployment>.convex.site
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};

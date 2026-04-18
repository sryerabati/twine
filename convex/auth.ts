/**
 * Auth providers configuration.
 *
 * Currently enabled:
 *   - Password (email + password)
 *
 * To enable Google OAuth:
 *   1. Create a Google Cloud OAuth 2.0 client (Web application type).
 *   2. Authorized redirect URI:
 *        https://<your-deployment>.convex.site/api/auth/callback/google
 *      Replace <your-deployment> with the name of your Convex deployment.
 *   3. Run:
 *        npx convex env set AUTH_GOOGLE_ID <client-id>
 *        npx convex env set AUTH_GOOGLE_SECRET <client-secret>
 *   4. Uncomment the Google() import and provider below.
 *   5. Redeploy Convex (it will happen automatically if `npx convex dev` is running).
 */
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
// import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "")
          .trim()
          .toLowerCase();
        if (!email) {
          throw new Error("Email is required.");
        }
        const explicitName = typeof params.name === "string" ? params.name.trim() : "";
        const fallbackName = email
          .split("@")[0]
          .replace(/[._-]+/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());

        return {
          email,
          name: explicitName || fallbackName,
        };
      },
      validatePasswordRequirements(password) {
        if (!password || password.length < 8) {
          throw new Error("Password must be at least 8 characters long.");
        }
      },
    }),
    // Google,
  ],
});

import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/**
 * Returns the currently logged-in user's public profile, or null if
 * the request is unauthenticated.
 *
 * This is the one query the client relies on for "am I logged in?" — keep it
 * cheap and do not add side effects.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (user === null) {
      return null;
    }
    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      image: user.image ?? null,
    };
  },
});

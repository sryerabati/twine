import { ConvexReactClient } from "convex/react";

let client: ConvexReactClient | null = null;
let clientUrl: string | null = null;

export function getConvexUrl() {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
}

export function isConvexConfigured() {
  return getConvexUrl().length > 0;
}

export function getConvexClient() {
  const convexUrl = getConvexUrl();

  if (!convexUrl) {
    return null;
  }

  if (client === null || clientUrl !== convexUrl) {
    client = new ConvexReactClient(convexUrl);
    clientUrl = convexUrl;
  }
  return client;
}

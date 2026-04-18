import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

/**
 * HTTP routes for service-to-service calls from FastAPI.
 *
 * Security model:
 *   - Every /service/* route requires header `x-service-secret` matching
 *     the environment variable `CONVEX_SERVICE_SECRET`.
 *   - The secret is compared in constant time to avoid timing leaks.
 *   - If `CONVEX_SERVICE_SECRET` is unset on the deployment, every request
 *     is rejected so a misconfiguration cannot accidentally expose writes.
 *   - Routes call `internalMutation` handlers in `service.ts` via
 *     `ctx.runMutation(internal.service.*, ...)`.
 */

const http = httpRouter();

// Register Convex Auth's required HTTP routes.
auth.addHttpRoutes(http);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function assertServiceSecret(request: Request): void {
  const configured = process.env.CONVEX_SERVICE_SECRET;
  if (!configured) {
    throw new Response("Service authentication is not configured.", {
      status: 503,
    });
  }
  const provided = request.headers.get("x-service-secret") ?? "";
  if (!timingSafeEqual(provided, configured)) {
    throw new Response("Unauthorized.", { status: 401 });
  }
}

async function parseJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Response("Invalid JSON body.", { status: 400 });
  }
}

http.route({
  path: "/service/upload/attach",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      assertServiceSecret(request);
      const body = await parseJson<{
        uploadId: string;
        localUploadId: string;
        durationSec?: number;
      }>(request);
      if (!body.uploadId || !body.localUploadId) {
        return new Response("uploadId and localUploadId are required.", {
          status: 400,
        });
      }
      await ctx.runMutation(internal.service.attachUploadLocalId, {
        uploadId: body.uploadId as never,
        localUploadId: body.localUploadId,
        durationSec: body.durationSec,
      });
      return new Response(null, { status: 204 });
    } catch (err) {
      if (err instanceof Response) return err;
      return new Response("Internal error.", { status: 500 });
    }
  }),
});

http.route({
  path: "/service/scan/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      assertServiceSecret(request);
      const body = await parseJson<{
        scanId: string;
        status: "queued" | "running" | "completed" | "failed";
        localAnalysisId?: string;
        errorMessage?: string;
      }>(request);
      if (!body.scanId || !body.status) {
        return new Response("scanId and status are required.", { status: 400 });
      }
      await ctx.runMutation(internal.service.updateScanStatus, {
        scanId: body.scanId as never,
        status: body.status,
        localAnalysisId: body.localAnalysisId,
        errorMessage: body.errorMessage,
      });
      return new Response(null, { status: 204 });
    } catch (err) {
      if (err instanceof Response) return err;
      return new Response("Internal error.", { status: 500 });
    }
  }),
});

http.route({
  path: "/service/scan/summary",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      assertServiceSecret(request);
      const body = await parseJson<{
        scanId: string;
        viralPotential?: number;
        hookScore?: number;
        pacingScore?: number;
        retentionEstimate?: number;
        deadspaceSeconds?: number;
        trimmedDurationSec?: number;
        overallRecommendation?: string;
      }>(request);
      if (!body.scanId) {
        return new Response("scanId is required.", { status: 400 });
      }
      await ctx.runMutation(internal.service.attachScanSummary, {
        scanId: body.scanId as never,
        viralPotential: body.viralPotential,
        hookScore: body.hookScore,
        pacingScore: body.pacingScore,
        retentionEstimate: body.retentionEstimate,
        deadspaceSeconds: body.deadspaceSeconds,
        trimmedDurationSec: body.trimmedDurationSec,
        overallRecommendation: body.overallRecommendation,
      });
      return new Response(null, { status: 204 });
    } catch (err) {
      if (err instanceof Response) return err;
      return new Response("Internal error.", { status: 500 });
    }
  }),
});

export default http;

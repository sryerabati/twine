/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * This repository does not have a configured Convex deployment yet, so these
 * typed references are checked in as a local bootstrap. `npx convex dev`
 * will regenerate this file once `CONVEX_DEPLOYMENT` is configured.
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import { anyApi } from "convex/server";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as scans from "../scans.js";
import type * as service from "../service.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";

const fullApi: ApiFromModules<{
  auth: typeof auth;
  http: typeof http;
  scans: typeof scans;
  service: typeof service;
  uploads: typeof uploads;
  users: typeof users;
}> = anyApi as never;

export const api: FilterApi<typeof fullApi, FunctionReference<any, "public">> = anyApi as never;
export const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">> = anyApi as never;

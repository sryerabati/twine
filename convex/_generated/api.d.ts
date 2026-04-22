/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as editorProjects from "../editorProjects.js";
import type * as editorService from "../editorService.js";
import type * as http from "../http.js";
import type * as repurposeProjects from "../repurposeProjects.js";
import type * as repurposeService from "../repurposeService.js";
import type * as scans from "../scans.js";
import type * as service from "../service.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  editorProjects: typeof editorProjects;
  editorService: typeof editorService;
  http: typeof http;
  repurposeProjects: typeof repurposeProjects;
  repurposeService: typeof repurposeService;
  scans: typeof scans;
  service: typeof service;
  uploads: typeof uploads;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

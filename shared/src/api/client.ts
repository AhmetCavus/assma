import { z } from "zod";
import type { YappioClient } from "yappio-client";
import {
  accountSchema,
  adminOverviewSchema,
  loginResultSchema,
  type LoginRequest,
} from "../account.js";
import {
  experienceProfileSchema,
  profileImageSchema,
  type ProfileImageUpload,
  experienceReferenceSchema,
  experienceSchema,
  type ProfileInput,
  type ReferenceInput,
} from "../experience.js";
import {
  cvImportAppliedSchema,
  cvImportJobSchema,
  cvImportStatusSchema,
  type CvImportApply,
  type CvImportRequest,
} from "../cvImport.js";
import {
  listingFetchResultSchema,
  listingJobSchema,
  projectSchema,
  type ListingFetchRequest,
  type ListingSuggestRequest,
  type ProjectChange,
  type ProjectInput,
} from "../projects.js";
import { fitJobSchema, type CvDraftInput, type FindingChange } from "../fit.js";
import {
  applicationFileContentSchema,
  applicationSchema,
  applicationSummarySchema,
  type ApplicationChange,
  type ApplicationInput,
  type EventInput,
} from "../applications.js";
import { assistantJobSchema, type AssistantInput } from "../assistant.js";

export const API_PREFIX = "/api/assma";

export class AssmaApiError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly code: string,
  ) {
    super(code);
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNetwork(): boolean {
    return this.status === null;
  }
}

type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/** Thin typed boundary over Yappio's REST engine; it keeps auth headers and base URL. */
export class AssmaApi {
  constructor(private readonly client: YappioClient) {}

  /** Signs in through assma's own login, which applies attempt limits. */
  login(input: LoginRequest) {
    return this.call("post", "/account/login", loginResultSchema, input);
  }

  account() {
    return this.call("get", "/account", accountSchema);
  }

  experience() {
    return this.call("get", "/experience", experienceSchema);
  }

  saveProfile(input: ProfileInput) {
    return this.call("put", "/experience/profile", experienceProfileSchema, input);
  }

  uploadImage(input: ProfileImageUpload) {
    return this.call("post", "/experience/images", profileImageSchema, input);
  }

  deleteImage(id: string) {
    return this.call("delete", `/experience/images/${id}`, z.object({ id: z.string() }));
  }

  createReference(input: ReferenceInput) {
    return this.call("post", "/experience/references", experienceReferenceSchema, input);
  }

  updateReference(id: string, input: ReferenceInput) {
    return this.call("put", `/experience/references/${id}`, experienceReferenceSchema, input);
  }

  deleteReference(id: string) {
    return this.call("delete", `/experience/references/${id}`, z.object({ id: z.string() }));
  }

  cvImportStatus() {
    return this.call("get", "/experience/import/status", cvImportStatusSchema);
  }

  startCvImport(input: CvImportRequest) {
    return this.call("post", "/experience/import", cvImportJobSchema, input);
  }

  cvImport(id: string) {
    return this.call("get", `/experience/import/${id}`, cvImportJobSchema);
  }

  cancelCvImport(id: string) {
    return this.call("delete", `/experience/import/${id}`, z.object({ id: z.string() }));
  }

  applyCvImport(input: CvImportApply) {
    return this.call("post", "/experience/import/apply", cvImportAppliedSchema, input);
  }

  projects() {
    return this.call("get", "/projects", z.array(projectSchema));
  }

  project(id: string) {
    return this.call("get", `/projects/${id}`, projectSchema);
  }

  createProject(input: ProjectInput) {
    return this.call("post", "/projects", projectSchema, input);
  }

  updateProject(id: string, input: ProjectInput) {
    return this.call("put", `/projects/${id}`, projectSchema, input);
  }

  changeProject(id: string, input: ProjectChange) {
    return this.call("patch", `/projects/${id}`, projectSchema, input);
  }

  deleteProject(id: string) {
    return this.call("delete", `/projects/${id}`, z.object({ id: z.string() }));
  }

  fetchListing(input: ListingFetchRequest) {
    return this.call("post", "/projects/listing/fetch", listingFetchResultSchema, input);
  }

  suggestListing(input: ListingSuggestRequest) {
    return this.call("post", "/projects/listing/suggest", listingJobSchema, input);
  }

  listingSuggestion(id: string) {
    return this.call("get", `/projects/listing/suggest/${id}`, listingJobSchema);
  }

  cancelListingSuggestion(id: string) {
    return this.call("delete", `/projects/listing/suggest/${id}`, z.object({ id: z.string() }));
  }

  startFit(projectId: string) {
    return this.call("post", `/projects/${projectId}/fit`, fitJobSchema);
  }

  fitJob(projectId: string, jobId: string) {
    return this.call("get", `/projects/${projectId}/fit/${jobId}`, fitJobSchema);
  }

  cancelFit(projectId: string, jobId: string) {
    return this.call("delete", `/projects/${projectId}/fit/${jobId}`, z.object({ id: z.string() }));
  }

  changeFinding(projectId: string, index: number, change: FindingChange) {
    return this.call("put", `/projects/${projectId}/fit/findings/${index}`, projectSchema, change);
  }

  askAssistant(input: AssistantInput) {
    return this.call("post", "/assistant", assistantJobSchema, input);
  }

  assistantJob(id: string) {
    return this.call("get", `/assistant/${id}`, assistantJobSchema);
  }

  cancelAssistant(id: string) {
    return this.call("delete", `/assistant/${id}`, z.object({ id: z.string() }));
  }

  saveCv(projectId: string, draft: CvDraftInput) {
    return this.call("put", `/projects/${projectId}/cv`, projectSchema, draft);
  }

  applications() {
    return this.call("get", "/applications", z.array(applicationSummarySchema));
  }

  application(id: string) {
    return this.call("get", `/applications/${id}`, applicationSchema);
  }

  createApplication(input: ApplicationInput) {
    return this.call("post", "/applications", applicationSchema, input);
  }

  changeApplication(id: string, change: ApplicationChange) {
    return this.call("patch", `/applications/${id}`, applicationSchema, change);
  }

  deleteApplication(id: string) {
    return this.call("delete", `/applications/${id}`, z.object({ id: z.string() }));
  }

  applicationFile(id: string) {
    return this.call("get", `/applications/${id}/file`, applicationFileContentSchema);
  }

  addApplicationEvent(id: string, input: EventInput) {
    return this.call("post", `/applications/${id}/events`, applicationSchema, input);
  }

  removeApplicationEvent(id: string, eventId: string) {
    return this.call("delete", `/applications/${id}/events/${eventId}`, applicationSchema);
  }

  adminOverview() {
    return this.call("get", "/admin/overview", adminOverviewSchema);
  }

  private async call<T>(
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    schema: Schema<T>,
    body?: object,
  ): Promise<T> {
    const rest = this.client.rest();
    const url = `${API_PREFIX}${path}`;
    let response: unknown;
    try {
      response =
        method === "get" || method === "delete"
          ? await rest[method](url)
          : await rest[method](url, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw toApiError(error);
    }
    const envelope = z.object({ success: z.literal(true), data: z.unknown() }).safeParse(response);
    if (!envelope.success) {
      throw new AssmaApiError(500, "invalid_response");
    }
    return schema.parse(envelope.data.data);
  }
}

export function toApiError(error: unknown): AssmaApiError {
  if (error instanceof AssmaApiError) {
    return error;
  }
  const parsed = z
    .object({
      response: z.object({
        status: z.number(),
        data: z.object({ error: z.string().optional() }).passthrough().optional(),
      }),
    })
    .safeParse(error);
  if (parsed.success) {
    return new AssmaApiError(
      parsed.data.response.status,
      parsed.data.response.data?.error ?? "request_failed",
    );
  }
  return new AssmaApiError(null, "network");
}

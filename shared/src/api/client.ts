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
  experienceReferenceSchema,
  experienceSchema,
  type ProfileInput,
  type ReferenceInput,
} from "../experience.js";

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

  createReference(input: ReferenceInput) {
    return this.call("post", "/experience/references", experienceReferenceSchema, input);
  }

  updateReference(id: string, input: ReferenceInput) {
    return this.call("put", `/experience/references/${id}`, experienceReferenceSchema, input);
  }

  deleteReference(id: string) {
    return this.call("delete", `/experience/references/${id}`, z.object({ id: z.string() }));
  }

  adminOverview() {
    return this.call("get", "/admin/overview", adminOverviewSchema);
  }

  private async call<T>(
    method: "get" | "post" | "put" | "delete",
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

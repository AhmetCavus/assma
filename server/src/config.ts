/** The logical database assma owns on shared-mongo. */
export const DATABASE_NAME = "assma";
export const DEFAULT_PORT = "4100";

/**
 * Settings the API refuses to start without. Returns the problems by setting name only,
 * never a value, so the message is safe to log.
 */
export function configurationProblems(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  let databaseName: string | null = null;
  try {
    databaseName = env.DB_URI ? new URL(env.DB_URI).pathname.replace(/^\//, "") : null;
  } catch {
    problems.push("DB_URI is not a valid URI");
  }
  if (!env.DB_URI) {
    problems.push("DB_URI is missing");
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    problems.push("JWT_SECRET needs at least 32 characters");
  }
  if (!env.INITIAL_ADMIN_USER || !env.INITIAL_ADMIN_PASS) {
    problems.push("INITIAL_ADMIN_USER and INITIAL_ADMIN_PASS are required");
  }
  if (env.NODE_ENV === "production" && databaseName !== null && databaseName !== DATABASE_NAME) {
    problems.push(`Production must use the ${DATABASE_NAME} logical database on shared-mongo`);
  }
  return problems;
}

/** Browser origins allowed to call the API, without trailing slashes. */
export function allowedOrigins(value: string | undefined): string[] {
  return (value ?? "https://assma.yappai.de")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

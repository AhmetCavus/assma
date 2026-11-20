import { useCallback, useMemo, useState } from "react";
import { YappioClient, type Profile } from "yappio-client";
import { AssmaApi, isAdministrator, toApiError, type Copy } from "@assma/shared";

export const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4100";

function restoreProfile(client: YappioClient): Profile | null {
  try {
    client.initializeFromStorage();
    const profile = client.isInitialized() ? client.statusInfo().profile : null;
    if (!isAdministrator(profile?.role) || client.isTokenExpired()) {
      client.reset();
      return null;
    }
    return profile;
  } catch {
    client.reset();
    return null;
  }
}

export type AdminSession = ReturnType<typeof useAdminSession>;

/**
 * Signs in through assma's login and keeps only admin and root. The server checks the role
 * again on every admin request, so this only decides what the panel shows.
 */
export function useAdminSession(copy: Copy) {
  const client = useMemo(() => new YappioClient({ baseUrl: apiBase }), []);
  const api = useMemo(() => new AssmaApi(client), [client]);
  const [profile, setProfile] = useState<Profile | null>(() => restoreProfile(client));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signOut = useCallback(
    (message = "") => {
      client.reset();
      setProfile(null);
      setError(message);
    },
    [client],
  );

  async function signIn(email: string, password: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const { token } = await api.login({ email: email.trim(), password });
      const initialized = await client.initialize(token);
      const next = initialized.success ? client.statusInfo().profile : null;
      if (!next || !isAdministrator(next.role)) {
        client.reset();
        setError(next ? copy.admin.noPermission : copy.auth.loginFailed);
        return false;
      }
      setProfile(next);
      return true;
    } catch (failure) {
      const apiError = toApiError(failure);
      setError(
        apiError.isNetwork
          ? copy.common.error
          : apiError.code === "too_many_attempts"
            ? copy.auth.tooMany
            : copy.auth.loginFailed,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { api, profile, busy, error, signIn, signOut };
}

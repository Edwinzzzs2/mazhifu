"use client";

const ACCESS_TOKEN_KEY = "mazhifu_admin_access_token";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "mazhifu_admin_access_token_expires_at";
const EXPIRY_BUFFER_MS = 30 * 1000;

type AdminAccessTokenPayload = {
  access_token?: string;
  access_token_expires_at?: string;
  message?: string;
};

let refreshPromise: Promise<string | null> | null = null;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isFresh(expiresAtText: string | null) {
  if (!expiresAtText) {
    return false;
  }
  return new Date(expiresAtText).getTime() - Date.now() > EXPIRY_BUFFER_MS;
}

export function setAdminAccessToken(accessToken: string, expiresAt: string) {
  if (!canUseStorage()) {
    return;
  }
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.sessionStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_KEY, expiresAt);
}

export function clearAdminAccessToken() {
  if (!canUseStorage()) {
    return;
  }
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
}

function getStoredAccessToken() {
  if (!canUseStorage()) {
    return null;
  }

  const accessToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  const expiresAt = window.sessionStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
  if (!accessToken || !isFresh(expiresAt)) {
    return null;
  }
  return accessToken;
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as AdminAccessTokenPayload;
  } catch {
    return {} as AdminAccessTokenPayload;
  }
}

async function refreshAdminAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/admin/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const data = await parseJson(response);
        if (!response.ok || !data.access_token || !data.access_token_expires_at) {
          clearAdminAccessToken();
          return null;
        }
        setAdminAccessToken(data.access_token, data.access_token_expires_at);
        return data.access_token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function getAdminAccessToken() {
  return getStoredAccessToken() ?? refreshAdminAccessToken();
}

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const accessToken = await getAdminAccessToken();
  const headers = new Headers(init.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "same-origin",
    headers,
  });
  if (response.status !== 401) {
    return response;
  }

  clearAdminAccessToken();
  const refreshedToken = await refreshAdminAccessToken();
  if (!refreshedToken) {
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);
  return fetch(input, {
    ...init,
    credentials: init.credentials ?? "same-origin",
    headers: retryHeaders,
  });
}

export async function postAdminCredentials(url: string, payload: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await parseJson(response);
  if (!response.ok || !data.access_token || !data.access_token_expires_at) {
    throw new Error(data.message || "认证失败");
  }
  setAdminAccessToken(data.access_token, data.access_token_expires_at);
}

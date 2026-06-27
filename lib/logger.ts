type LogLevel = "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;

const SENSITIVE_KEYS = new Set([
  "access_token",
  "authorization",
  "cookie",
  "key",
  "password",
  "query_password",
  "querypassword",
  "set-cookie",
  "sign",
  "status_token_hash",
  "token",
]);

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[-\s]/g, "_");
  return SENSITIVE_KEYS.has(normalized) || normalized.endsWith("_token");
}

function redactSearchParams(value: string) {
  const prefix = value.startsWith("?") ? "?" : "";
  const source = prefix ? value.slice(1) : value;

  if (!source.includes("=")) return value;

  try {
    const params = new URLSearchParams(source);
    let changed = false;
    params.forEach((_paramValue, paramKey) => {
      if (isSensitiveKey(paramKey)) {
        params.set(paramKey, "[redacted]");
        changed = true;
      }
    });
    return changed ? prefix + params.toString() : value;
  } catch {
    return value;
  }
}

function redactUrl(value: string) {
  try {
    const url = new URL(value);
    url.searchParams.forEach((_paramValue, paramKey) => {
      if (isSensitiveKey(paramKey)) {
        url.searchParams.set(paramKey, "[redacted]");
      }
    });
    return url.toString();
  } catch {
    return redactSearchParams(value);
  }
}

function serializeError(error: Error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause,
  };
}

function sanitizeValue(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (isSensitiveKey(key)) return "[redacted]";

  if (value instanceof Error) {
    return sanitizeValue(serializeError(value), key, seen);
  }

  if (value instanceof URL) {
    return redactUrl(value.toString());
  }

  if (typeof value === "string") {
    if (key.toLowerCase().includes("url")) return redactUrl(value);
    if (key.toLowerCase().includes("query") || key.toLowerCase().includes("body")) {
      return redactSearchParams(value);
    }
    return value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeValue(entryValue, entryKey, seen),
    ]),
  );
}

function padNumber(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function formatTimestamp(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absOffsetMinutes / 60);
  const offsetRemainderMinutes = absOffsetMinutes % 60;

  return [
    `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}.${padNumber(date.getMilliseconds(), 3)}`,
    `${offsetSign}${padNumber(offsetHours)}:${padNumber(offsetRemainderMinutes)}`,
  ].join(" ");
}

function writeLog(level: LogLevel, scope: string, message: string, meta?: LogMeta) {
  const payload = meta ? sanitizeValue(meta) : undefined;
  const line = `${formatTimestamp()} [${scope}] ${message}`;

  if (level === "error") {
    payload === undefined ? console.error(line) : console.error(line, payload);
    return;
  }

  if (level === "warn") {
    payload === undefined ? console.warn(line) : console.warn(line, payload);
    return;
  }

  payload === undefined ? console.log(line) : console.log(line, payload);
}

export function createLogger(scope: string) {
  return {
    info(message: string, meta?: LogMeta) {
      writeLog("info", scope, message, meta);
    },
    warn(message: string, meta?: LogMeta) {
      writeLog("warn", scope, message, meta);
    },
    error(message: string, meta?: LogMeta) {
      writeLog("error", scope, message, meta);
    },
  };
}

import crypto from "crypto";

function getSecretMaterial() {
  const material =
    process.env.CARD_SECRET_ENCRYPTION_KEY ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.MAPAY_KEY;

  if (!material) {
    throw new Error("CARD_SECRET_ENCRYPTION_KEY is required");
  }

  return material;
}

function getEncryptionKey() {
  return crypto.createHash("sha256").update(getSecretMaterial()).digest();
}

export function hashCardSecret(secret: string) {
  return crypto.createHmac("sha256", getEncryptionKey()).update(secret).digest("hex");
}

export function encryptCardSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptCardSecret(payload: string) {
  const [version, ivText, tagText, encryptedText] = payload.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("invalid card secret payload");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

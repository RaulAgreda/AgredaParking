const crypto = require("node:crypto");
const { neon } = require("@neondatabase/serverless");

const SESSION_COOKIE = "agreda_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 210000;
const PASSWORD_KEY_LENGTH = 32;
const DEFAULT_PIN_COLOR = "#0f766e";

let sqlClient;
let schemaReady;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta configurada.");
  }

  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }

  return sqlClient;
}

async function ensureSchema() {
  if (schemaReady) {
    return;
  }

  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS cars (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image TEXT NOT NULL DEFAULT '',
      pin_color CHAR(7) NOT NULL DEFAULT '#0f766e',
      spot_lat DOUBLE PRECISION,
      spot_lng DOUBLE PRECISION,
      accuracy INTEGER,
      saved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS cars_user_id_idx ON cars(user_id)`;
  schemaReady = true;
}

function json(response, statusCode, body) {
  response.status(statusCode).json(body);
}

function methodNotAllowed(response) {
  json(response, 405, { error: "Metodo no permitido." });
}

function createId(prefix) {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function validateUsername(username) {
  return /^[a-z0-9._-]{3,24}$/.test(username);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 4 && password.length <= 128;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, "sha256")
    .toString("hex");
  return `pbkdf2:${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, iterations, salt, hash] = String(storedHash || "").split(":");
  if (algorithm !== "pbkdf2" || !iterations || !salt || !hash) {
    return false;
  }

  const calculated = crypto
    .pbkdf2Sync(password, salt, Number(iterations), PASSWORD_KEY_LENGTH, "sha256")
    .toString("hex");

  const storedBuffer = Buffer.from(hash, "hex");
  const calculatedBuffer = Buffer.from(calculated, "hex");
  return storedBuffer.length === calculatedBuffer.length && crypto.timingSafeEqual(storedBuffer, calculatedBuffer);
}

function getSessionSecret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
  }

  return process.env.SESSION_SECRET;
}

function signSession(userId) {
  const payload = {
    userId,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySession(token) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  const valid = signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  if (!valid) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.userId || payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

function readCookie(request, name) {
  const header = request.headers.cookie || "";
  const cookies = header.split(";").map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS};${secure}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function getCurrentUser(request) {
  const token = readCookie(request, SESSION_COOKIE);
  const session = verifySession(token);
  if (!session) {
    return null;
  }

  const sql = getSql();
  const users = await sql`SELECT id, username FROM users WHERE id = ${session.userId} LIMIT 1`;
  return users[0] || null;
}

function validatePinColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color : DEFAULT_PIN_COLOR;
}

function mapCar(row) {
  return {
    id: row.id,
    name: row.name,
    image: row.image || "",
    pinColor: row.pin_color || DEFAULT_PIN_COLOR,
    spot:
      row.spot_lat !== null && row.spot_lng !== null
        ? {
            lat: Number(row.spot_lat),
            lng: Number(row.spot_lng),
            accuracy: row.accuracy || 20,
            savedAt: row.saved_at,
          }
        : null,
  };
}

module.exports = {
  clearSessionCookie,
  createId,
  ensureSchema,
  getCurrentUser,
  getSql,
  hashPassword,
  json,
  mapCar,
  methodNotAllowed,
  normalizeUsername,
  setSessionCookie,
  signSession,
  validatePassword,
  validatePinColor,
  validateUsername,
  verifyPassword,
};

const {
  ensureSchema,
  getSql,
  json,
  normalizeUsername,
  setSessionCookie,
  signSession,
  validatePassword,
  validateUsername,
  verifyPassword,
  methodNotAllowed,
} = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  try {
    await ensureSchema();
    const username = normalizeUsername(request.body?.username);
    const password = request.body?.password;

    if (!validateUsername(username) || !validatePassword(password)) {
      json(response, 401, { error: "Usuario o contrasena incorrectos." });
      return;
    }

    const sql = getSql();
    const users = await sql`SELECT id, username, password_hash FROM users WHERE username = ${username} LIMIT 1`;
    const user = users[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      json(response, 401, { error: "Usuario o contrasena incorrectos." });
      return;
    }

    setSessionCookie(response, signSession(user.id));
    json(response, 200, { user: { id: user.id, username: user.username } });
  } catch (error) {
    json(response, 500, { error: error.message || "No se pudo iniciar sesion." });
  }
};

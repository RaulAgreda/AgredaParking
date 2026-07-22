const {
  createId,
  ensureSchema,
  getSql,
  hashPassword,
  json,
  normalizeUsername,
  setSessionCookie,
  signSession,
  validatePassword,
  validateUsername,
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

    if (!validateUsername(username)) {
      json(response, 400, { error: "Usuario invalido. Usa 3-24 caracteres: letras, numeros, punto, guion o guion bajo." });
      return;
    }

    if (!validatePassword(password)) {
      json(response, 400, { error: "La contrasena debe tener entre 4 y 128 caracteres." });
      return;
    }

    const sql = getSql();
    const id = createId("user");
    const passwordHash = hashPassword(password);

    try {
      await sql`INSERT INTO users (id, username, password_hash) VALUES (${id}, ${username}, ${passwordHash})`;
    } catch (error) {
      if (error.code === "23505") {
        json(response, 409, { error: "Ese usuario ya existe." });
        return;
      }
      throw error;
    }

    setSessionCookie(response, signSession(id));
    json(response, 201, { user: { id, username } });
  } catch (error) {
    json(response, 500, { error: error.message || "No se pudo crear el usuario." });
  }
};

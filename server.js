const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const { Pool } = require("pg");

const app = express();

/* =========================
   📁 PATHS
========================= */

const CLIENT_PATH = path.join(__dirname, "client");

/* =========================
   🗄️ SUPABASE (Postgres)
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   🔥 CREAR TABLA AUTOMÁTICA
========================= */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    );
  `);

  console.log("✅ DB lista");
}

initDB();

/* =========================
   MIDDLEWARES
========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "pikmin-super-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(express.static(CLIENT_PATH));

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(CLIENT_PATH, "login.html"));
});

/* =========================
   REGISTER
========================= */

app.post("/register", async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email.endsWith("@alumno.etec.um.edu.ar")) {
      return res.status(400).send("Usá el mail institucional");
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (email, username, password) VALUES ($1,$2,$3) RETURNING id",
      [email, username, hash]
    );

    req.session.userId = result.rows[0].id;

    res.redirect("/feed.html");

  } catch (err) {
    console.log(err);
    res.status(400).send("Usuario ya existe");
  }
});

/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  const user = result.rows[0];

  if (!user) return res.status(400).send("No existe");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).send("Contraseña incorrecta");

  req.session.userId = user.id;

  res.redirect("/feed.html");
});

/* =========================
   USERS (admin view)
========================= */

app.get("/users", async (req, res) => {
  const result = await pool.query(
    "SELECT id, email, username, role FROM users"
  );

  res.json(result.rows);
});

/* =========================
   HACER MOD
========================= */

app.post("/make-mod/:id", async (req, res) => {
  await pool.query(
    "UPDATE users SET role='mod' WHERE id=$1",
    [req.params.id]
  );

  res.send("Ahora es moderador ✅");
});

/* =========================
   PERFIL
========================= */

app.get("/me", async (req, res) => {
  if (!req.session.userId) return res.status(401).send("No autorizado");

  const result = await pool.query(
    "SELECT id, username, email, role FROM users WHERE id=$1",
    [req.session.userId]
  );

  res.json(result.rows[0]);
});

/* =========================
   LOGOUT
========================= */

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* =========================
   SERVER
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server corriendo");
});

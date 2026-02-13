const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

const app = express();

/* =========================
   PATHS SEGUROS
========================= */
const CLIENT_PATH = path.join(__dirname, "..", "client");
const DB_PATH = path.join(__dirname, "database.db");

/* =========================
   DB
========================= */
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error(err);
  else console.log("✅ DB conectada");
});

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

/* 👉 MUY IMPORTANTE: servir frontend */
app.use(express.static(CLIENT_PATH));

/* 👉 Ruta principal (arregla el Cannot GET /) */
app.get("/", (req, res) => {
  res.sendFile(path.join(CLIENT_PATH, "login.html"));
});

/* =========================
   CREAR TABLA
========================= */
db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  username TEXT,
  password TEXT
)
`);

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

    db.run(
      "INSERT INTO users (email, username, password) VALUES (?, ?, ?)",
      [email, username, hash],
      function (err) {
        if (err) return res.status(400).send("Usuario ya existe");

        req.session.userId = this.lastID;

        // 👉 redirige al feed
        res.redirect("/feed.html");
      }
    );
  } catch (e) {
    res.status(500).send("Error interno");
  }
});

/* =========================
   LOGIN
========================= */
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (!user) return res.status(400).send("No existe");

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).send("Contraseña incorrecta");

    req.session.userId = user.id;

    // 👉 redirige al feed
    res.redirect("/feed.html");
  });
});

/* =========================
   SESIÓN ACTUAL
========================= */
app.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(401).send("No autorizado");

  db.get(
    "SELECT id, username, email FROM users WHERE id = ?",
    [req.session.userId],
    (err, user) => res.json(user)
  );
});

/* =========================
   LOGOUT
========================= */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server corriendo"));

;

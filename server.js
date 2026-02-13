const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const { Pool } = require("pg");
const multer = require("multer");
const app = express();
const fs = require("fs");
const path = require("path");

/* =========================
   📸 UPLOADS CONFIG
========================= */

const UPLOAD_PATH = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOAD_PATH)) {
  fs.mkdirSync(UPLOAD_PATH);
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_PATH),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, req.session.userId + "-" + file.fieldname + ext);
  }
});

const upload = multer({ storage });

app.use("/uploads", express.static(UPLOAD_PATH));

/* =========================
   DB (SUPABASE POSTGRES)
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   INIT DB (SIN TOP LEVEL AWAIT)
========================= */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      username TEXT,
      password TEXT,
      role TEXT DEFAULT 'user',
      avatar TEXT,
      banner TEXT
    )
  `);

  console.log("✅ Tabla lista");
}

initDB().catch(console.error);

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

app.use(express.static(path.join(__dirname, "client")));

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "client/login.html"));
});

/* =========================
   REGISTER
========================= */

app.post("/register", async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email.endsWith("@alumno.etec.um.edu.ar"))
      return res.status(400).send("Usá el mail institucional");

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (email, username, password) VALUES ($1,$2,$3)",
      [email, username, hash]
    );

    res.redirect("/login.html");
  } catch (e) {
    res.status(400).send("Usuario ya existe");
  }
});

/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  const user = rows[0];

  if (!user) return res.status(400).send("No existe");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).send("Contraseña incorrecta");

  req.session.userId = user.id;

  res.redirect("/feed.html");
});

/* =========================
   PERFIL ACTUAL
========================= */

app.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(401).send("No autorizado");

  pool.query(
    "SELECT id, username, email, role, banner, avatar, bio FROM users WHERE id=$1",
    [req.session.userId]
  )
  .then(r => res.json(r.rows[0]));
});


/* =========================
   EDITAR PERFIL (foto/banner)
========================= */

app.post("/profile", async (req, res) => {
  const { avatar, banner, username } = req.body;

  await pool.query(
    "UPDATE users SET avatar=$1, banner=$2, username=$3 WHERE id=$4",
    [avatar, banner, username, req.session.userId]
  );

  res.send("Perfil actualizado ✅");
});

/* =========================
   USERS ADMIN
========================= */

app.get("/users", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id,email FROM users"
  );

  res.json(rows);
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

/* =========================
   ✏️ UPDATE PROFILE
========================= */

app.post(
  "/update-profile",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banner", maxCount: 1 }
  ]),
  async (req, res) => {
    if (!req.session.userId) return res.sendStatus(401);

    const { bio } = req.body;

    const avatar = req.files.avatar
      ? "/uploads/" + req.files.avatar[0].filename
      : null;

    const banner = req.files.banner
      ? "/uploads/" + req.files.banner[0].filename
      : null;

    await pool.query(
      `
      UPDATE users
      SET bio = COALESCE($1,bio),
          avatar = COALESCE($2,avatar),
          banner = COALESCE($3,banner)
      WHERE id=$4
      `,
      [bio, avatar, banner, req.session.userId]
    );

    res.redirect("/perfil.html");
  }
);

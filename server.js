const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const app = express();

/* =========================
   📁 PATHS IMPORTANTES
========================= */

// Render borra el proyecto, pero /tmp vive mientras corre
/* PATHS SEGUROS */

const DB_PATH = path.join(process.cwd(), "server", "database.db");


// backup json (por si se reinicia)
const BACKUP_PATH = path.join(__dirname, "backup-users.json");

const CLIENT_PATH = path.join(process.cwd(), "client");

/* =========================
   🗄️ DB
========================= */

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error(err);
  else console.log("✅ DB conectada");
});


/* =========================
   🔄 RESTORE BACKUP (MAGIA)
   si la db está vacía, restaura
========================= */

function restoreBackup() {
  if (!fs.existsSync(BACKUP_PATH)) return;

  const users = JSON.parse(fs.readFileSync(BACKUP_PATH));

  users.forEach(u => {
    db.run(
      "INSERT OR IGNORE INTO users (id, email, username, password, role) VALUES (?, ?, ?, ?, ?)",
      [u.id, u.email, u.username, u.password, u.role]
    );
  });

  console.log("♻️ Backup restaurado");
}


/* =========================
   💾 GUARDAR BACKUP
========================= */

function saveBackup() {
  db.all("SELECT * FROM users", (err, rows) => {
    if (!err) {
      fs.writeFileSync(BACKUP_PATH, JSON.stringify(rows, null, 2));
      console.log("💾 Backup guardado");
    }
  });
}


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
   TABLA
========================= */

db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  username TEXT,
  password TEXT,
  role TEXT DEFAULT 'user'
)
`, restoreBackup);


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

        saveBackup(); // ⭐ guardar cambios

        res.redirect("/feed.html");
      }
    );
  } catch {
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

    res.redirect("/feed.html");
  });
});


/* =========================
   USERS (solo mails)
   👉 para vos como admin
========================= */

app.get("/users", (req, res) => {
  db.all("SELECT id, email FROM users", (err, rows) => {
    res.json(rows);
  });
});


/* =========================
   HACER MODERADOR
========================= */

app.post("/make-mod/:id", (req, res) => {
  db.run(
    "UPDATE users SET role='mod' WHERE id=?",
    [req.params.id],
    () => {
      saveBackup();
      res.send("Ahora es moderador ✅");
    }
  );
});


/* =========================
   PERFIL
========================= */

app.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(401).send("No autorizado");

  db.get(
    "SELECT id, username, email, role FROM users WHERE id=?",
    [req.session.userId],
    (err, user) => res.json(user)
  );
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

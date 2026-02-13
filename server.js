/*************************
  IMPORTS
*************************/
const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const multer = require("multer");
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server);

/*************************
  SUPABASE CLIENT
*************************/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/*************************
  CONFIG
*************************/
const CLIENT_PATH = path.join(__dirname, "client");

/*************************
  DB (SUPABASE POSTGRES)
*************************/
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/*************************
  INIT TABLAS
*************************/
async function initDB() {
  // Tabla users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      username TEXT,
      password TEXT,
      role TEXT DEFAULT 'user',
      bio TEXT,
      avatar TEXT,
      banner TEXT
    )
  `);

  // Tabla posts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Índices para mejor performance
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
  `);

  console.log("✅ Tablas users y posts listas");
}

initDB().catch(console.error);

/*************************
  MULTER (MEMORIA)
*************************/
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
});

/*************************
  HELPER: SUBIR A SUPABASE
*************************/
async function uploadToSupabase(file, userId, type) {
  // type = 'avatar', 'banner', o 'post'
  const ext = path.extname(file.originalname);
  const fileName = `${userId}-${type}-${Date.now()}${ext}`;
  
  let filePath;
  if (type === 'post') {
    filePath = `posts/${fileName}`;
  } else {
    filePath = `${type}s/${fileName}`;
  }

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (error) throw error;

  // Obtener URL pública
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  return publicUrl;
}

/*************************
  MIDDLEWARES
*************************/

// Trust proxy - IMPORTANTE para Render
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "pikmin-super-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(express.static(CLIENT_PATH));

// Debug middleware
app.use((req, res, next) => {
  console.log('📍', req.method, req.path, '| Session:', req.session.userId || 'sin sesión');
  next();
});

/*************************
  HOME
*************************/
app.get("/", (_, res) => {
  res.sendFile(path.join(CLIENT_PATH, "login.html"));
});

/*************************
  REGISTER
*************************/
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

  } catch (err) {
    console.error(err);
    res.status(400).send("Usuario ya existe");
  }
});

/*************************
  LOGIN
*************************/
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    const user = rows[0];
    if (!user) return res.status(400).send("No existe");

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).send("Contraseña incorrecta");

    // Guardar userId en la sesión
    req.session.userId = user.id;
    
    // Guardar la sesión antes de redirigir
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error guardando sesión:', err);
        return res.status(500).send("Error guardando sesión");
      }
      console.log('✅ Sesión guardada para usuario:', user.id, user.username);
      res.redirect("/feed.html");
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).send("Error en el servidor");
  }
});

/*************************
  ENDPOINT /me
*************************/
app.get("/me", async (req, res) => {
  try {
    if (!req.session.userId) {
      console.log('⚠️ /me sin sesión');
      return res.sendStatus(401);
    }

    const { rows } = await pool.query(
      "SELECT id, username, email, role, bio, avatar, banner FROM users WHERE id=$1",
      [req.session.userId]
    );

    if (rows.length === 0) {
      console.log('⚠️ Usuario no encontrado:', req.session.userId);
      return res.sendStatus(401);
    }

    console.log('✅ /me OK:', rows[0].username);
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Error en /me:', err);
    res.status(500).json({ error: "Error al obtener usuario" });
  }
});

/*************************
  ACTUALIZAR PERFIL
*************************/
app.post(
  "/update-profile",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banner", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      if (!req.session.userId) return res.sendStatus(401);

      const { bio } = req.body;
      let avatar = null;
      let banner = null;

      // Subir avatar si existe
      if (req.files.avatar && req.files.avatar[0]) {
        avatar = await uploadToSupabase(
          req.files.avatar[0],
          req.session.userId,
          'avatar'
        );
      }

      // Subir banner si existe
      if (req.files.banner && req.files.banner[0]) {
        banner = await uploadToSupabase(
          req.files.banner[0],
          req.session.userId,
          'banner'
        );
      }

      // Actualizar base de datos
      await pool.query(`
        UPDATE users
        SET
          bio    = COALESCE($1, bio),
          avatar = COALESCE($2, avatar),
          banner = COALESCE($3, banner)
        WHERE id=$4
      `, [bio, avatar, banner, req.session.userId]);

      res.redirect("/profile.html");
    } catch (err) {
      console.error('Error actualizando perfil:', err);
      res.status(500).send("Error al actualizar perfil");
    }
  }
);

/*************************
  ADMIN USERS
*************************/
app.get("/users", async (_, res) => {
  try {
    const { rows } = await pool.query("SELECT id,email,username,role FROM users");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

/*************************
  POSTS - OBTENER TODOS
*************************/
app.get("/posts", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        p.id,
        p.content,
        p.image_url,
        p.created_at,
        u.id as user_id,
        u.username,
        u.avatar,
        u.role
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 100
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error obteniendo posts:', err);
    res.status(500).json({ error: "Error al obtener posts" });
  }
});

/*************************
  POSTS - CREAR NUEVO
*************************/
app.post(
  "/posts",
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.session.userId) return res.sendStatus(401);

      const { content } = req.body;
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "El contenido es requerido" });
      }

      if (content.length > 500) {
        return res.status(400).json({ error: "El contenido es muy largo (máx 500 caracteres)" });
      }

      let imageUrl = null;

      // Subir imagen si existe
      if (req.file) {
        imageUrl = await uploadToSupabase(
          req.file,
          req.session.userId,
          'post'
        );
      }

      // Insertar post
      const { rows } = await pool.query(`
        INSERT INTO posts (user_id, content, image_url)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [req.session.userId, content.trim(), imageUrl]);

      console.log('✅ Post creado:', rows[0].id);

      res.json({ 
        success: true, 
        postId: rows[0].id 
      });

    } catch (err) {
      console.error('Error creando post:', err);
      res.status(500).json({ error: "Error al crear post" });
    }
  }
);

/*************************
  POSTS - ELIMINAR
*************************/
app.delete("/posts/:id", async (req, res) => {
  try {
    if (!req.session.userId) return res.sendStatus(401);

    const postId = req.params.id;

    // Verificar si el usuario es dueño del post o es moderador
    const { rows: userRows } = await pool.query(
      "SELECT role FROM users WHERE id=$1",
      [req.session.userId]
    );

    const { rows: postRows } = await pool.query(
      "SELECT user_id FROM posts WHERE id=$1",
      [postId]
    );

    if (postRows.length === 0) {
      return res.status(404).json({ error: "Post no encontrado" });
    }

    const isModerator = userRows[0].role === 'mod';
    const isOwner = postRows[0].user_id === req.session.userId;

    if (!isModerator && !isOwner) {
      return res.status(403).json({ error: "No tienes permiso para eliminar este post" });
    }

    await pool.query("DELETE FROM posts WHERE id=$1", [postId]);

    res.json({ success: true });

  } catch (err) {
    console.error('Error eliminando post:', err);
    res.status(500).json({ error: "Error al eliminar post" });
  }
});

/*************************
  LOGOUT
*************************/
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/*************************
  MANEJO DE ERRORES
*************************/
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Algo salió mal!');
});

/*************************
  SERVER
*************************/
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server corriendo en puerto", PORT);
  console.log("📝 Modo:", process.env.NODE_ENV || 'development');
});

/*************************
  💬 CHATROOM
*************************/

let messages = [];

io.on("connection", (socket) => {
  console.log("🟢 user conectado");

  // enviar historial
  socket.emit("history", messages);

  socket.on("message", (msg) => {
    const data = {
      text: msg,
      time: new Date().toLocaleTimeString()
    };

    messages.push(data);

    // limitar historial
    if (messages.length > 50) messages.shift();

    io.emit("message", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 user salió");
  });
});
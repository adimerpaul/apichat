require('dotenv').config();

const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const TEMP_DIR = path.join(UPLOAD_DIR, 'tmp');
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

ffmpeg.setFfmpegPath(ffmpegPath);

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chat_socket',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let pool;
const connectedUsers = new Map();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, TEMP_DIR),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${cryptoRandom()}${extension}`);
    },
  }),
  limits: {
    fileSize: 80 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('Solo se permiten imagenes JPG/PNG/WebP y videos MP4/MOV/WebM.'));
      return;
    }

    callback(null, true);
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function removeTempFile(filePath) {
  const retryableCodes = new Set(['EBUSY', 'EPERM']);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fs.unlink(filePath);
      return;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      if (!retryableCodes.has(error.code) || attempt === 5) {
        throw error;
      }

      await wait(120 * attempt);
    }
  }
}

async function ensureUploadDirs() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbConfig.database, table, column]
  );

  return rows.length > 0;
}

async function addColumnIfMissing(table, column, definition) {
  if (!(await columnExists(table, column))) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function migrateTables() {
  await addColumnIfMissing(
    'users',
    'updated_at',
    'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
  );
  await addColumnIfMissing('users', 'deleted_at', 'deleted_at DATETIME NULL');
  await addColumnIfMissing(
    'messages',
    'updated_at',
    'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
  );
  await addColumnIfMissing('messages', 'deleted_at', 'deleted_at DATETIME NULL');
  await addColumnIfMissing('messages', 'media_type', 'media_type VARCHAR(20) NULL');
  await addColumnIfMissing('messages', 'media_url', 'media_url VARCHAR(255) NULL');
  await addColumnIfMissing('messages', 'media_name', 'media_name VARCHAR(255) NULL');
  await addColumnIfMissing('messages', 'media_size', 'media_size INT NULL');
  await pool.query('ALTER TABLE messages MODIFY message TEXT NULL');
}

function getConnectedUsers() {
  return Array.from(connectedUsers.values()).map((item) => ({
    id: item.user.id,
    name: item.user.name,
    sockets: item.sockets.size,
  }));
}

function emitConnectedUsers() {
  io.emit('users:connected', getConnectedUsers());
}

function addConnectedUser(socket, user) {
  const current = connectedUsers.get(user.id) || { user, sockets: new Set() };
  current.user = user;
  current.sockets.add(socket.id);
  connectedUsers.set(user.id, current);
  emitConnectedUsers();
}

function removeConnectedUser(socket) {
  const user = socket.data.user;

  if (!user) {
    return;
  }

  const current = connectedUsers.get(user.id);

  if (!current) {
    return;
  }

  current.sockets.delete(socket.id);

  if (current.sockets.size === 0) {
    connectedUsers.delete(user.id);
  }

  emitConnectedUsers();
}

async function compressImage(file) {
  const filename = `${Date.now()}-${cryptoRandom()}.webp`;
  const outputPath = path.join(UPLOAD_DIR, filename);

  await sharp(file.path)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(outputPath);
  await removeTempFile(file.path);

  const stats = await fs.stat(outputPath);

  return {
    media_type: 'image',
    media_url: `/uploads/${filename}`,
    media_name: file.originalname,
    media_size: stats.size,
  };
}

async function compressVideo(file) {
  const filename = `${Date.now()}-${cryptoRandom()}.mp4`;
  const outputPath = path.join(UPLOAD_DIR, filename);

  await new Promise((resolve, reject) => {
    ffmpeg(file.path)
      .outputOptions([
        '-vf scale=trunc(min(1280,iw)/2)*2:-2',
        '-c:v libx264',
        '-preset veryfast',
        '-crf 28',
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart',
      ])
      .format('mp4')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });

  await removeTempFile(file.path);

  const stats = await fs.stat(outputPath);

  return {
    media_type: 'video',
    media_url: `/uploads/${filename}`,
    media_name: file.originalname,
    media_size: stats.size,
  };
}

async function processUpload(file) {
  if (!file) {
    return {
      media_type: null,
      media_url: null,
      media_name: null,
      media_size: null,
    };
  }

  if (file.mimetype.startsWith('image/')) {
    return compressImage(file);
  }

  return compressVideo(file);
}

async function ensureDatabase() {
  await ensureUploadDirs();

  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();

  pool = mysql.createPool(dbConfig);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      message TEXT NULL,
      media_type VARCHAR(20) NULL,
      media_url VARCHAR(255) NULL,
      media_name VARCHAR(255) NULL,
      media_size INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      CONSTRAINT fk_messages_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await migrateTables();
}

async function registerUser(name) {
  const cleanName = String(name || '').trim();

  if (!cleanName) {
    const error = new Error('El nombre es obligatorio.');
    error.status = 400;
    throw error;
  }

  if (cleanName.length > 80) {
    const error = new Error('El nombre no puede superar 80 caracteres.');
    error.status = 400;
    throw error;
  }

  await pool.query(
    `INSERT INTO users (name)
     VALUES (?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), deleted_at = NULL`,
    [cleanName]
  );

  const [rows] = await pool.query(
    'SELECT id, name, created_at, updated_at FROM users WHERE name = ? AND deleted_at IS NULL',
    [cleanName]
  );

  return rows[0];
}

async function getMessages() {
  const [rows] = await pool.query(`
    SELECT
      messages.id,
      messages.message,
      messages.media_type,
      messages.media_url,
      messages.media_name,
      messages.media_size,
      messages.created_at,
      messages.updated_at,
      users.id AS user_id,
      users.name AS user_name
    FROM messages
    INNER JOIN users ON users.id = messages.user_id
    WHERE messages.deleted_at IS NULL AND users.deleted_at IS NULL
    ORDER BY messages.created_at ASC, messages.id ASC
  `);

  return rows;
}

async function getMessageById(id) {
  const [rows] = await pool.query(
    `SELECT
      messages.id,
      messages.message,
      messages.media_type,
      messages.media_url,
      messages.media_name,
      messages.media_size,
      messages.created_at,
      messages.updated_at,
      users.id AS user_id,
      users.name AS user_name
    FROM messages
    INNER JOIN users ON users.id = messages.user_id
    WHERE messages.id = ? AND messages.deleted_at IS NULL AND users.deleted_at IS NULL`,
    [id]
  );

  return rows[0];
}

async function createMessage({ userId, message, file }) {
  const cleanMessage = String(message || '').trim();
  const media = await processUpload(file);

  if (!cleanMessage && !media.media_url) {
    const error = new Error('Debes enviar un mensaje, una imagen o un video.');
    error.status = 400;
    throw error;
  }

  const [userRows] = await pool.query(
    'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
    [userId]
  );

  if (userRows.length === 0) {
    const error = new Error('El usuario no existe.');
    error.status = 404;
    throw error;
  }

  const [result] = await pool.query(
    `INSERT INTO messages
      (user_id, message, media_type, media_url, media_name, media_size)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      cleanMessage || null,
      media.media_type,
      media.media_url,
      media.media_name,
      media.media_size,
    ]
  );

  return getMessageById(result.insertId);
}

app.get('/api/register', async (req, res, next) => {
  try {
    const user = await registerUser(req.query.name);
    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/users', async (req, res, next) => {
  try {
    const user = await registerUser(req.body.name);
    res.status(201).json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/chats', async (_req, res, next) => {
  try {
    const messages = await getMessages();
    res.json({ ok: true, messages });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chats', upload.single('file'), async (req, res, next) => {
  try {
    const message = await createMessage({
      userId: req.body.user_id,
      message: req.body.message,
      file: req.file,
    });
    io.emit('chat:message', message);
    res.status(201).json({ ok: true, message });
  } catch (error) {
    if (req.file) {
      await removeTempFile(req.file.path).catch(() => {});
    }
    next(error);
  }
});

app.put('/api/chats/:id', async (req, res, next) => {
  try {
    const cleanMessage = String(req.body.message || '').trim();

    if (!cleanMessage) {
      const error = new Error('El mensaje no puede estar vacio.');
      error.status = 400;
      throw error;
    }

    await pool.query(
      'UPDATE messages SET message = ? WHERE id = ? AND deleted_at IS NULL',
      [cleanMessage, req.params.id]
    );

    const message = await getMessageById(req.params.id);
    io.emit('chat:updated', message);
    res.json({ ok: true, message });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/chats/:id', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE messages SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    io.emit('chat:deleted', { id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/users', async (_req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT id, name, created_at, updated_at
       FROM users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC, id DESC`
    );
    res.json({ ok: true, users });
  } catch (error) {
    next(error);
  }
});

app.get('/api/connected-users', (_req, res) => {
  res.json({ ok: true, users: getConnectedUsers() });
});

app.delete('/api/users/:id', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

io.on('connection', (socket) => {
  socket.on('user:register', async (name, callback) => {
    try {
      const user = await registerUser(name);
      socket.data.user = user;
      addConnectedUser(socket, user);
      socket.emit('chat:history', await getMessages());
      io.emit('user:joined', user);
      callback?.({ ok: true, user });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('chat:message', async (text, callback) => {
    try {
      const user = socket.data.user;
      const message = String(text || '').trim();

      if (!user) {
        throw new Error('Primero registra tu nombre.');
      }

      const createdMessage = await createMessage({ userId: user.id, message });

      io.emit('chat:message', createdMessage);
      callback?.({ ok: true });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('disconnect', () => {
    removeConnectedUser(socket);
  });
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    ok: false,
    message: error.message || 'Error interno del servidor.',
  });
});

ensureDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Servidor listo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo iniciar la base de datos:', error.message);
    process.exit(1);
  });

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya esta en uso. Cambia PORT en .env o cierra el proceso anterior.`);
    process.exit(1);
  }

  console.error('No se pudo iniciar el servidor:', error.message);
  process.exit(1);
});

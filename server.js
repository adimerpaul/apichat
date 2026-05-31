require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

async function ensureDatabase() {
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_messages_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [cleanName]
  );

  const [rows] = await pool.query(
    'SELECT id, name, created_at FROM users WHERE name = ?',
    [cleanName]
  );

  return rows[0];
}

async function getMessages() {
  const [rows] = await pool.query(`
    SELECT
      messages.id,
      messages.message,
      messages.created_at,
      users.id AS user_id,
      users.name AS user_name
    FROM messages
    INNER JOIN users ON users.id = messages.user_id
    ORDER BY messages.created_at ASC, messages.id ASC
  `);

  return rows;
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

app.get('/api/users', async (_req, res, next) => {
  try {
    const [users] = await pool.query(
      'SELECT id, name, created_at FROM users ORDER BY created_at DESC, id DESC'
    );
    res.json({ ok: true, users });
  } catch (error) {
    next(error);
  }
});

io.on('connection', (socket) => {
  socket.on('user:register', async (name, callback) => {
    try {
      const user = await registerUser(name);
      socket.data.user = user;
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

      if (!message) {
        throw new Error('El mensaje no puede estar vacio.');
      }

      const [result] = await pool.query(
        'INSERT INTO messages (user_id, message) VALUES (?, ?)',
        [user.id, message]
      );
      const [rows] = await pool.query(
        `SELECT
          messages.id,
          messages.message,
          messages.created_at,
          users.id AS user_id,
          users.name AS user_name
        FROM messages
        INNER JOIN users ON users.id = messages.user_id
        WHERE messages.id = ?`,
        [result.insertId]
      );

      io.emit('chat:message', rows[0]);
      callback?.({ ok: true });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
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

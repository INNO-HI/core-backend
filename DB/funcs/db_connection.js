const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'db',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || 'example',
  database: process.env.MYSQL_DATABASE || 'safe_hi',
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONN_LIMIT || 10),
  queueLimit: 0,
  dateStrings: true,
});

module.exports = pool;

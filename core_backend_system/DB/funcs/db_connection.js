// db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',     // MySQL 서버 주소
    user: 'root', // MySQL 사용자명
    password: 'root', // MySQL 비밀번호
    database: 'safe_hi', // 사용할 데이터베이스 이름
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true 
});

// Export the pool instance
module.exports = pool;
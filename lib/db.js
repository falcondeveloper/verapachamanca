const mysql = require("mysql2/promise");
const credentials = require("./credentials");

async function getDb() {
  return mysql.createConnection({
    host: credentials.mysql.host,
    port: credentials.mysql.port,
    user: credentials.mysql.user,
    password: credentials.mysql.password,
    database: credentials.mysql.database,
    connectTimeout: 10000,
    charset: "utf8mb4"
  });
}

module.exports = { getDb };

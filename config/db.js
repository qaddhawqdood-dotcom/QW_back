const { MongoClient } = require("mongodb");

let db;

async function connectDB() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  db = client.db(process.env.DB_NAME);
  console.log("✅ Connected to MongoDB");
  return { client, db };
}

function getDB() {
  if (!db) throw new Error("Database not initialized");
  return db;
}

module.exports = { connectDB, getDB };

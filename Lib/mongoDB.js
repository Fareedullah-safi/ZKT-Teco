import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("CRITICAL: Please define MONGODB_URI in your .env.local file!");
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {conn: null, promise: null};
}

export default async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10, // Maintain up to 10 socket connections for unlimited concurrency
      serverSelectionTimeoutMS: 10000, // Keep trying to send operations for 10s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      console.log("✅ MongoDB Connected Successfully");
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error("❌ MongoDB Connection Error:", e);
    throw e;
  }

  return cached.conn;
}

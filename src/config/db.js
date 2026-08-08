
const mongoose = require("mongoose");

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongoose) => {
      console.log("Connected to MongoDB (Serverless Optimized)");
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.log("DB Connection error:", error);
    process.exit(1);
  }
  
  return cached.conn;
};
module.exports = connectDB;
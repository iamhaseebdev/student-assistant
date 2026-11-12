// Backend/config/db.config.js
import mongoose from 'mongoose';

// Connection string ka env naam: apne project wala rakhein (yahan common naam try hote hain)
const getUri = () =>
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.DB_URL;

// Ek hi connection poore process (local) / warm Vercel instance me reuse hota hai
const cache = (global._mongooseCache ||= { promise: null });

mongoose.connection.on('disconnected', () => {
    cache.promise = null; // agle request par dobara connect ho
});

export default async function connectToDb() {
    if (mongoose.connection.readyState === 1) return mongoose; // already connected -> kuch nahi karna

    if (!cache.promise) {
        const uri = getUri();
        if (!uri) throw new Error('MongoDB connection string missing in env (e.g. MONGO_URI)');

        cache.promise = mongoose
            .connect(uri, {
                bufferCommands: false,
                serverSelectionTimeoutMS: 8000,
                maxPoolSize: 5
            })
            .then((m) => {
                console.log('Database Connected Successfully!!!'); // sirf ek baar
                return m;
            })
            .catch((err) => {
                cache.promise = null; // fail hua to agli request dobara try kare
                throw err;
            });
    }

    await cache.promise;
    return mongoose;
}
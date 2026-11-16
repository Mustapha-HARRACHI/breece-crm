import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from './app.js';

dotenv.config();

const port = Number(process.env.PORT) || 5000;

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Unable to connect to MongoDB:', error.message);
    process.exit(1);
  }
};

start();

import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  target: { type: Number, required: true, min: 1, max: 100000 }
}, { timestamps: true });

goalSchema.index({ owner: 1, month: 1 }, { unique: true });
export default mongoose.model('Goal', goalSchema);

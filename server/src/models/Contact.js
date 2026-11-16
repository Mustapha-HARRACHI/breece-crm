import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firstName: { type: String, trim: true, required: true, maxlength: 100 },
    lastName: { type: String, trim: true, maxlength: 100 },
    photo: { type: String, trim: true, maxlength: 2048 },
    meetingDate: { type: Date },
    meetingPlace: { type: String, trim: true, maxlength: 200 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 40 },
    company: { type: String, trim: true, maxlength: 150 },
    jobTitle: { type: String, trim: true, maxlength: 150 },
    mainSocialNetwork: { type: String, trim: true, maxlength: 100 },
    category: { type: String, enum: ['Professional', 'Personal', 'Network'], default: 'Network' },
    notes: { type: String, trim: true, maxlength: 5000 },
    relationshipStatus: { type: String, enum: ['Active', 'Inactive', 'ToContact'], default: 'Active' }
  },
  { timestamps: true }
);

contactSchema.index({ owner: 1, lastName: 1, firstName: 1 });
contactSchema.index({ owner: 1, category: 1 });
contactSchema.index({ owner: 1, createdAt: -1 });

export default mongoose.model('Contact', contactSchema);

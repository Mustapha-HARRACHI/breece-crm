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
    ,followUpAt: { type: Date },
    reminderNote: { type: String, trim: true, maxlength: 1000 },
    followUpStatus: { type: String, enum: ['Scheduled', 'Completed', 'Cancelled'], default: 'Scheduled' },
    reminderEmailEnabled: { type: Boolean, default: false },
    notificationStatus: { type: String, enum: ['Disabled', 'Pending', 'Sending', 'Sent', 'Failed'], default: 'Disabled' },
    notificationAttempts: { type: Number, default: 0, min: 0, max: 3, select: false },
    notificationClaimedAt: { type: Date, select: false },
    notificationClaimId: { type: String, select: false },
    notificationNextAttemptAt: { type: Date, select: false },
    notificationSentAt: { type: Date, select: false },
    notificationLastError: { type: String, maxlength: 500, select: false }
  },
  { timestamps: true }
);

contactSchema.index({ owner: 1, lastName: 1, firstName: 1 });
contactSchema.index({ owner: 1, category: 1 });
contactSchema.index({ owner: 1, createdAt: -1 });
contactSchema.index({ followUpAt: 1, reminderEmailEnabled: 1, notificationStatus: 1 });

export default mongoose.model('Contact', contactSchema);

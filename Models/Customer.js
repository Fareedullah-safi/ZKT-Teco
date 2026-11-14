import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    subjectId: {type: String, required: true, unique: true, trim: true, index: true},
    fullName: {type: String, required: true, trim: true},
    phone: {type: String, default: ""},
    email: {type: String, default: ""},
    nationality: {type: String, default: ""},
    address: {type: String, default: ""},
    notes: {type: String, default: ""},
    // 💡 Stores the master biometric template in MongoDB permanently
    fingerprintTemplate: {type: String, default: ""},
    enrolledAt: {type: Date, default: Date.now},
    lastIdentifiedAt: {type: Date, default: null},
  },
  {timestamps: true}
);

export default mongoose.models.Customer || mongoose.model("Customer", CustomerSchema);

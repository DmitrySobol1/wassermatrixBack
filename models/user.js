import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    tlgid: {
      type: Number,
      required: true,
      unique: true,
    },
    jbid: Number,
    valute: String,
    language: String,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('User', UserSchema);

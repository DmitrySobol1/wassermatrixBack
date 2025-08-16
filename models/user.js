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
    name: {
      type: String,
      default: ''
    },
    phone: {
      type: String,
      default: ''
    },
    adress: {
      type: String,
      default: ''
    },
    tags: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tags'
    }],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('User', UserSchema);

//for commit
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
    cashbackBall: {
      type: Number,
      default: 0
    },
    crmStatus : {
      type: Number,
      default: 1
    },
    isWaitingAdminAction: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('User', UserSchema);

//for commit
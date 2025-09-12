import mongoose from 'mongoose';

const ReferalsSchema = new mongoose.Schema(
  {
    father: Number,   
    son: Number,   
    isSonEnterToApp: {
        type: Boolean,
        default: false
    },   
    username: {
      type: String,
      default: null
    }
    
  },
  {
    timestamps: true 
  }
);

export default mongoose.model('Referals', ReferalsSchema);
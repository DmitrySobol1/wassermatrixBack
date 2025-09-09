import mongoose from 'mongoose';

const CashbackBallSchema = new mongoose.Schema(
  {
      
    sum: Number,
    percent: Number,
    name: String,
    position: Number,
   
  },
  {
    timestamps: true // Автоматические created_at и updated_at
  }
);



export default mongoose.model('CashbackBall', CashbackBallSchema);
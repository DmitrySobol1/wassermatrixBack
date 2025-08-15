import mongoose from 'mongoose';

const ReceiptsSchema = new mongoose.Schema(
  {
    url: String,   
    payment_intent: String
    
  },
  {
    timestamps: true 
  }
);


export default mongoose.model('Receipts', ReceiptsSchema);
import mongoose from 'mongoose';

const ReferalsPromoForPurchaseSchema = new mongoose.Schema(
  {
    // qty: Number,   
    sale: Number,   
    // description: String    
  },
  {
    timestamps: true 
  }
);

export default mongoose.model('ReferalsPromoForPurchase', ReferalsPromoForPurchaseSchema);
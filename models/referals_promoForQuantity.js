import mongoose from 'mongoose';

const ReferalsPromoForQuantitySchema = new mongoose.Schema(
  {
    qty: Number,   
    sale: Number,   
    description: String    
  },
  {
    timestamps: true 
  }
);

export default mongoose.model('ReferalsPromoForQuantity', ReferalsPromoForQuantitySchema);
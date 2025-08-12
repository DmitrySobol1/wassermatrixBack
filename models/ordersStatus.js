import mongoose from 'mongoose';

const OrdersStatusSchema = new mongoose.Schema(
  {
    name_ru: String,
    name_en: String,
    name_de: String,
    numForFilter: Number
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('OrdersStatus', OrdersStatusSchema);

import mongoose from 'mongoose';

const GoodsTypesSchema = new mongoose.Schema(
  {
    name_ru: String,
    name_en: String,
    name_de: String,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('GoodsTypes', GoodsTypesSchema);

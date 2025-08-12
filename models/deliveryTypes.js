import mongoose from 'mongoose';

const DeliveryTypesSchema = new mongoose.Schema(
  {
    name_ru: String,
    name_en: String,
    name_de: String,
    comments_ru: String,
    comments_en: String,
    comments_de: String,
    price_eu: Number,

  },
  {
    timestamps: true,
  }
);

export default mongoose.model('DeliveryTypes', DeliveryTypesSchema);

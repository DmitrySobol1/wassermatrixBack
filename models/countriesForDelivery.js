import mongoose from 'mongoose';

const CountriesForDeliverySchema = new mongoose.Schema(
  {
    name_ru: String,
    name_en: String,
    name_de: String,
    isEU: Boolean,
    

  },
  {
    timestamps: true,
  }
);

export default mongoose.model('CountriesForDelivery', CountriesForDeliverySchema);

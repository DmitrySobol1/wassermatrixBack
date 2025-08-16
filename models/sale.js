import mongoose from 'mongoose';

const SaleSchema = new mongoose.Schema(
  {
    title_de: String,   
    title_en: String,   
    title_ru: String,   
    subtitle_de: String,
    subtitle_en: String,
    subtitle_ru: String,
    info_de: String,
    info_en: String,
    info_ru: String,
    dateUntil: String,
    buttonText_en:String,
    buttonText_de:String,
    buttonText_ru:String,
    isShowButton: {
      type: Boolean,
      default: false
    },
    file: {
      filename: String,
      contentType: String,
      size: Number,
      url: String,
    },
    good: {
      type: mongoose.Schema.Types.ObjectId, // Ссылка на товар
      ref: 'Goods'
    }
    
  },
  {
    timestamps: true 
  }
);


export default mongoose.model('Sale', SaleSchema);
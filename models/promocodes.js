import mongoose from 'mongoose';

const PromocodesSchema = new mongoose.Schema(
  {
    tlgid: [{  // список тех, кто воспользовался промокодом
      type: mongoose.Schema.Types.ObjectId,  // ObjectId ссылки на пользователей
      ref: 'User',   // Ссылка на модель User
      required: false
    }],
    
    code: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    description_admin: {
      type: String,
      required: true
    },
    description_users_de: {
      type: String,
      required: true
    },
    description_users_en: {
      type: String,
      required: true
    },
    description_users_ru: {
      type: String,
      required: true
    },
    type: {
      type: String,
      default: 'general'
    },
    expiryDate: {
      type: Date,
      required: true
    },
    saleInPercent: {
      type: Number,
      default: 0
    }, 
    isActive: {
      type: Boolean,
      default: true
    },
    forFirstPurshase: {
      type: Boolean, 
      default: false,
    }
  },
  {
    timestamps: true // Автоматические created_at и updated_at
  }
);



export default mongoose.model('Promocodes', PromocodesSchema);
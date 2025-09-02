import mongoose from 'mongoose';

const PromocodesPersonalSchema = new mongoose.Schema(
  {
    tlgid: {  
          type: mongoose.Schema.Types.ObjectId,  // ссылка на пользователя
          ref: 'User',   // Ссылка на модель User
          required: false
        },
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
      default: 'personal',
      
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
    isUsed: {
      type: Boolean,
      default: false   // касается только personal
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



export default mongoose.model('PromocodesPersonal', PromocodesPersonalSchema);
import mongoose from 'mongoose';

const GoodsSchema = new mongoose.Schema(
  {
    
    article: {
      type: String,
      required: true
      // unique: true,
    },
    name_ru: String,
    name_en: String,
    name_de: String,

    description_short_en: String,
    description_short_de: String,
    description_short_ru: String,

    description_long_en: String,
    description_long_de: String,
    description_long_ru: String,

    price_eu: Number,
    priceToShow_eu: Number, // add
    isSaleNow: {            // add
      type: Boolean,
      default: false
    },
    saleInfo: {                 // add
      saleValue: {
        type: Number,
        default: 0
      },
      infoForFront_de: {
        type: String,
        default: ''
      },
      infoForFront_en: {
        type: String,
        default: ''
      },
      infoForFront_ru: {
        type: String,
        default: ''
      }
    },
    img: String,
    type: String,

    delivery_price_de: Number, 
    delivery_price_inEu: Number, 
    delivery_price_outEu: Number, 
    quantityOfPurchases: {
      type: Number,
      default: 0
    },
    file: {
      filename: String,
      contentType: String,
      size: Number,
      url: String,
    },
    
  },
  {
    timestamps: true,
  }
);


// Добавляем обработку ошибок валидации
GoodsSchema.post('save', function(error, doc, next) {
  if (error.name === 'ValidationError') {
    console.error('[Mongoose] Validation error:', error.errors);
    next(new Error(Object.values(error.errors).map(e => e.message).join(', ')));
  } else {
    next(error);
  }
});



export default mongoose.model('Goods', GoodsSchema);

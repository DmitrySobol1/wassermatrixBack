import mongoose from 'mongoose';

const CartsSchema = new mongoose.Schema(
  {
      tlgid: {  // Название поля в корзине
      type: Number,  // Тип должен соответствовать tlgid в User
      ref: 'User',   // Ссылка на модель User
      required: true,
      index: true
    },
    jbid: Number,
    goods: [{
      itemId: {
        type: mongoose.Schema.Types.ObjectId, // Ссылка на товар
        ref: 'Goods', 
        required: true
      },
      qty: {
        type: Number,
        required: true,
        min: 1 // Минимальное количество
      }
    }]
  },
  {
    timestamps: true // Автоматические created_at и updated_at
  }
);

// Опционально: добавляем индекс для часто используемых запросов
// CartsSchema.index({ userId: 1 });

export default mongoose.model('Carts', CartsSchema);
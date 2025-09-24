import mongoose from 'mongoose';

const OrdersSchema = new mongoose.Schema(
  {
    tlgid: {
      // Название поля в корзине
      type: Number, // Тип должен соответствовать tlgid в User
      ref: 'User', // Ссылка на модель User
      required: true,
      index: true,
    },
    jbid: Number,
    goods: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId, // Ссылка на товар
          ref: 'Goods',
          required: true,
        },
        qty: {
          type: Number,
          required: true,
          min: 1, // Минимальное количество
        },
        actualPurchasePriceInEu: Number,
        isPurchasedBySale: {
          type: Boolean,
          default: false,
        },

        isPurchasedByPromocode: {
          type: Boolean,
          default: false,
        },
        isPurchasedByCashback: {
          type: Boolean,
          default: false, 
        },
        promocode: String,
        promocodeType: String,


      },
    ],
    country: String,
    regionDelivery: String,
    adress: String,
    phone: String,
    name: String,
    orderStatus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrdersStatus',
      required: true,
      default: new mongoose.Types.ObjectId('689b8a7a931ce1b95f7c76b2'),
    },
    payStatus: Boolean,
    stripeSessionId: String, // ID сессии Stripe для отслеживания платежа
    receipt: {
      type: String,
      default: '',
    },
    payment_intent: {
      type: String,
      default: '',
    },
    eta: {
      type: String,
      default: '',
    },
    messageToClientAboutDelivery: {
      type: Boolean,
      default: false,
    },
    typeLoyaltySystem: String,
    shouldBeCashbacked: {
      type: Number,
      default: 0
    },
    cashbackValute: {
      type: String,
      default: 'no'
    },
    isCashbackOperationDone: {
      type: String,
      default: 'no'
    },
    isUserConfirmDelivery: {
      type: Boolean,
      default: null
    }
  },
  {
    timestamps: true, // Автоматические created_at и updated_at
  }
);

export default mongoose.model('Orders', OrdersSchema);


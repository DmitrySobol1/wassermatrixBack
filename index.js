import express from 'express';
import mongoose from 'mongoose';
import UserModel from './models/user.js';
import GoodsModel from './models/goods.js';
import GoodsTypesModel from './models/goodsTypes.js';
import DeliveryTypesModel from './models/deliveryTypes.js';
import CartsModel from './models/carts.js';
import CountriesForDeliveryModel from './models/countriesForDelivery.js';
import OrdersModel from './models/orders.js';
import OrdersStatusSchema from './models/ordersStatus.js';
import ReceiptsModel from './models/receipts.js';
import SaleModel from './models/sale.js';
import TagsModel from './models/tags.js';

import { Convert } from 'easy-currencies';
import Stripe from 'stripe';

// для файлов
import multer from 'multer';

import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import https from 'https';

const PORT = process.env.PORT || 4444;

// Инициализация Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

import { TEXTS } from './texts.js';
import goods from './models/goods.js';

// const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB SHOP - OK'))
  .catch((err) => console.log('db error:', err));

const app = express();

// Stripe webhook должен быть ПЕРЕД express.json() для получения raw body
app.post(
  '/api/stripe-webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      // Проверяем подпись webhook от Stripe
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`Webhook signature verification failed.`, err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Обрабатываем событие
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('Payment was successful!', session.id);

        try {
          // Ищем заказ по stripeSessionId и обновляем payStatus
          const updatedOrder = await OrdersModel.findOneAndUpdate(
            { stripeSessionId: session.id }, // условие поиска
            {
              payStatus: true, 
              payment_intent: session.payment_intent, 
            },
            { new: true } 
          );

          if (updatedOrder) {
            console.log(
              `Order ${updatedOrder._id} payment status updated to true`
            );

            // Обновляем quantityOfPurchases для каждого товара в заказе
            if (updatedOrder.goods && Array.isArray(updatedOrder.goods)) {
              for (const item of updatedOrder.goods) {
                try {
                  await GoodsModel.findByIdAndUpdate(
                    item.itemId,
                    { $inc: { quantityOfPurchases: item.qty } },
                    { new: true }
                  );
                  console.log(`Updated quantityOfPurchases for item ${item.itemId} by ${item.qty}`);
                } catch (itemError) {
                  console.error(`Error updating quantityOfPurchases for item ${item.itemId}:`, itemError);
                }
              }
            }
          } else {
            console.log(`Order with session ID ${session.id} not found`);
          }
        } catch (error) {
          console.error('Error updating order payment status:', error);
        }
        break;

      case 'payment_intent.payment_failed':
        console.log('Payment failed for session:', event.data.object.id);
        break;

      case 'charge.updated':
        const intent = event.data.object;
        console.log('receipt received', intent.id);

        try {
          // создаем новую запись в БД ReceiptsModel
          const receipt = new ReceiptsModel({
              payment_intent: intent.payment_intent,
              url: intent.receipt_url,
          });

          await receipt.save();


          if (receipt) {
            console.log(
              `New payment intent ${intent.payment_intent} created at DB`
            );
          } else {
            console.log(
              `someting went wrong`
            );
          }
        } catch (error) {
          console.error('Error creating payment url:', error);
        }
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
);

app.use(express.json());
app.use(cors());

// для файлов
app.use('/uploads', express.static('uploads'));

// Конфигурация Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('[Multer] Configuring storage destination');
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + '-' + file.originalname;
    console.log('[Multer] Generated filename:', filename);
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый тип файла'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

app.get('/api', (req, res) => {
  res.send('hello man from shop');
});

// вход пользователя в аппку
app.post('/api/enter', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });

     console.log('jbid',req.body.jbid ) 

    //создание юзера
    if (!user) {
      await createNewUser(req.body.tlgid, req.body.jbid);
      const userData = { result: 'showOnboarding' };
      return res.json({ userData });
    }

    if (!user.jbid){
      // Обновляем jbid для существующего пользователя
      await UserModel.updateOne(
        { tlgid: req.body.tlgid },
        { jbid: req.body.jbid }
      );
      console.log('Updated jbid for existing user:', req.body.tlgid, 'with jbid:', req.body.jbid);
    }

    // извлечь инфо о юзере из БД и передать на фронт действие
    const { _id, ...userData } = user._doc;
    userData.result = 'showCatalogPage';
    return res.json({ userData });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

async function createNewUser(tlgid, jbid) {
  try {
    const doc = new UserModel({
      tlgid: tlgid,
      jbid: jbid,
      valute: '€',
      language: 'en',
    });

    await doc.save();
  } catch (err) {
    console.log(err);
  }
}

// создать новый товар
app.post('/api/admin_add_new_good', upload.single('file'), async (req, res) => {
  console.log('[Request] Received upload request');

  try {
    console.log('[Request] Body:', req.body);
    console.log('[Request] File:', req.file);

    if (!req.file) {
      console.error('[Validation] No file uploaded');
      return res.status(400).json({ error: 'Please upload a file' });
    }

    const {
      article,
      name_ru,
      name_en,
      name_de,
      description_short_en,
      description_short_de,
      description_short_ru,
      description_long_en,
      description_long_de,
      description_long_ru,
      price_eu,
      type,
      delivery_price_de,
      delivery_price_inEu,
      delivery_price_outEu,
    } = req.body;


    console.log('[Database] Creating document record...');
    const document = new GoodsModel({
      article,
      name_ru,
      name_en,
      name_de,
      description_short_en,
      description_short_de,
      description_short_ru,
      description_long_en,
      description_long_de,
      description_long_ru,
      price_eu,
      priceToShow_eu: price_eu,
      type,
      delivery_price_de,
      delivery_price_inEu,
      delivery_price_outEu,
      file: {
        filename: req.file.filename,
        contentType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`,
      },
    });

    const savedDoc = await document.save();
    console.log('[Database] Document saved:', savedDoc);

    res.status(201).json(savedDoc);
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});




// создать новую акцию
app.post('/api/admin_add_new_sale', upload.single('file'), async (req, res) => {
  console.log('[Request] Received upload request');

  try {
    console.log('[Request] Body:', req.body);
    console.log('[Request] File:', req.file);

    if (!req.file) {
      console.error('[Validation] No file uploaded');
      return res.status(400).json({ error: 'Please upload a file' });
    }

    const {
      title_de,
      title_en,
      title_ru,
      subtitle_de,
      subtitle_en,
      subtitle_ru,
      info_de,
      info_en,
      info_ru,
      dateUntil,
      buttonText_de,
      buttonText_en,
      buttonText_ru,
      good,
      isShowButton
    } = req.body;

    // Если good не передан или пустой, устанавливаем null
    const goodValue = good && good.trim() !== '' ? good : null;


    console.log('[Database] Creating document record...');
    const document = new SaleModel({
      title_de,
      title_en,
      title_ru,
      subtitle_de,
      subtitle_en,
      subtitle_ru,
      info_de,
      info_en,
      info_ru,
      dateUntil,
      buttonText_de,
      buttonText_en,
      buttonText_ru,
      good: goodValue,
      isShowButton: isShowButton === 'true',
      file: {
        filename: req.file.filename,
        contentType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`,
      },
    });

    const savedDoc = await document.save();
    console.log('[Database] Document saved:', savedDoc);

    res.status(201).json(savedDoc);
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// получить все акции
app.get('/api/admin_get_sales', async (req, res) => {
  try {
    const sales = await SaleModel.find().populate('good');
    console.log('[Database] Sales fetched:', sales.length);
    res.json(sales);
  } catch (error) {
    console.error('[Error] Failed to fetch sales:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// получить все теги
app.get('/api/admin_get_tags', async (req, res) => {
  try {
    const tags = await TagsModel.find().sort({ createdAt: -1 });
    console.log('[Database] Tags fetched:', tags.length);
    res.json(tags);
  } catch (error) {
    console.error('[Error] Failed to fetch tags:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// создать новый тег
app.post('/api/admin_add_tag', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({
        error: 'Tag name is required',
      });
    }

    if (!description || description.trim() === '') {
      return res.status(400).json({
        error: 'Tag description is required',
      });
    }

    // Проверяем, не существует ли уже тег с таким именем
    const existingTag = await TagsModel.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
    });

    if (existingTag) {
      return res.status(400).json({
        error: 'Tag with this name already exists',
      });
    }

    const newTag = new TagsModel({
      name: name.trim(),
      description: description.trim()
    });

    const savedTag = await newTag.save();
    console.log('[Database] New tag created:', savedTag.name);
    
    res.json({
      status: 'ok',
      tag: savedTag
    });
  } catch (error) {
    console.error('[Error] Failed to create tag:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// обновить тег
app.post('/api/admin_update_tag', async (req, res) => {
  try {
    const { id, name, description } = req.body;
    
    if (!id) {
      return res.status(400).json({
        error: 'Tag ID is required',
      });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({
        error: 'Tag name is required',
      });
    }

    if (!description || description.trim() === '') {
      return res.status(400).json({
        error: 'Tag description is required',
      });
    }

    // Проверяем, не существует ли уже тег с таким именем (исключая текущий)
    const existingTag = await TagsModel.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      _id: { $ne: id } 
    });

    if (existingTag) {
      return res.status(400).json({
        error: 'Tag with this name already exists',
      });
    }

    console.log('[Database] Updating tag with ID:', id);
    
    const updatedTag = await TagsModel.findByIdAndUpdate(
      id,
      { 
        name: name.trim(),
        description: description.trim()
      },
      { new: true } // Возвращаем обновленный документ
    );
    
    if (!updatedTag) {
      return res.status(404).json({
        error: 'Tag not found',
      });
    }

    console.log('[Database] Tag updated successfully:', updatedTag.name);
    
    res.json({
      status: 'ok',
      message: 'Tag updated successfully',
      tag: updatedTag
    });
  } catch (error) {
    console.error('[Error] Failed to update tag:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// удалить тег
app.post('/api/admin_delete_tag', async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({
        error: 'Tag ID is required',
      });
    }

    console.log('[Database] Deleting tag with ID:', id);
    
    const result = await TagsModel.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({
        error: 'Tag not found',
      });
    }

    console.log('[Database] Tag deleted successfully:', result.name);
    
    res.json({
      status: 'ok',
      message: 'Tag deleted successfully',
      deletedTag: result
    });
  } catch (error) {
    console.error('[Error] Failed to delete tag:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// удалить акцию
app.post('/api/admin_delete_sale', async (req, res) => {
  try {
    const { id } = req.body;
    console.log('[Database] Deleting sale with ID:', id);
    
    const result = await SaleModel.findByIdAndDelete(id);
    
    if (result) {
      console.log('[Database] Sale deleted successfully');
      res.json({ status: 'ok', message: 'Sale deleted successfully' });
    } else {
      res.status(404).json({ status: 'error', message: 'Sale not found' });
    }
  } catch (error) {
    console.error('[Error] Failed to delete sale:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// обновить акцию
app.post('/api/admin_update_sale', upload.single('file'), async (req, res) => {
  try {
    const {
      id,
      title_de,
      title_en,
      title_ru,
      subtitle_de,
      subtitle_en,
      subtitle_ru,
      info_de,
      info_en,
      info_ru,
      dateUntil,
      buttonText_de,
      buttonText_en,
      buttonText_ru,
      good,
      isShowButton
    } = req.body;

    console.log('[Database] Updating sale with ID:', id);

    // Если good не передан или пустой, устанавливаем null
    const goodValue = good && good.trim() !== '' ? good : null;

    const updateData = {
      title_de,
      title_en,
      title_ru,
      subtitle_de,
      subtitle_en,
      subtitle_ru,
      info_de,
      info_en,
      info_ru,
      dateUntil,
      buttonText_de,
      buttonText_en,
      buttonText_ru,
      good: goodValue,
      isShowButton: isShowButton === 'true'
    };

    // Если загружен новый файл, обновляем информацию о файле
    if (req.file) {
      updateData.file = {
        filename: req.file.filename,
        contentType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`,
      };
    }

    const updatedSale = await SaleModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedSale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    console.log('[Database] Sale updated successfully');
    res.json({ status: 'ok', sale: updatedSale });
  } catch (error) {
    console.error('[Error] Failed to update sale:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// получить всех пользователей
app.get('/api/admin_get_users', async (req, res) => {
  try {
    const users = await UserModel.find().populate('tags');
    console.log('[Database] Users fetched:', users.length);
    res.json(users);
  } catch (error) {
    console.error('[Error] Failed to fetch users:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// обновить теги пользователя
app.post('/api/admin_update_user_tags', async (req, res) => {
  try {
    const { userId, tagIds } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'Tag IDs must be an array' });
    }

    // Проверяем, что все теги существуют
    const existingTags = await TagsModel.find({ _id: { $in: tagIds } });
    if (existingTags.length !== tagIds.length) {
      return res.status(400).json({ error: 'One or more tags do not exist' });
    }

    // Обновляем пользователя
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { tags: tagIds },
      { new: true }
    ).populate('tags');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('[Database] User tags updated:', updatedUser._id);
    res.json({ status: 'ok', user: updatedUser });
  } catch (error) {
    console.error('[Error] Failed to update user tags:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// обновить информацию о специальном предложении товара
app.post('/api/admin_update_sale_info', async (req, res) => {
  try {
    const { goodId, saleValue, infoForFront_de, infoForFront_en, infoForFront_ru } = req.body;

    if (!goodId) {
      return res.status(400).json({ error: 'Good ID is required' });
    }

    if (!saleValue || isNaN(Number(saleValue)) || Number(saleValue) <= 0) {
      return res.status(400).json({ error: 'Sale value must be a positive number' });
    }

    // Получаем текущий товар для расчета новой цены
    const currentGood = await GoodsModel.findById(goodId);
    if (!currentGood) {
      return res.status(404).json({ error: 'Good not found' });
    }

    // Рассчитываем новую цену: price_eu - (price_eu * saleValue) / 100
    const originalPrice = currentGood.price_eu;
    const discount = (originalPrice * Number(saleValue)) / 100;
    const newPrice = originalPrice - discount;

    // Обновляем товар
    const updatedGood = await GoodsModel.findByIdAndUpdate(
      goodId,
      {
        isSaleNow: true,
        priceToShow_eu: newPrice,
        saleInfo: {
          saleValue: Number(saleValue),
          infoForFront_de: infoForFront_de || '',
          infoForFront_en: infoForFront_en || '',
          infoForFront_ru: infoForFront_ru || ''
        }
      },
      { new: true }
    );

    if (!updatedGood) {
      return res.status(404).json({ error: 'Good not found' });
    }

    console.log('[Database] Good sale info updated:', updatedGood._id);
    res.json({ status: 'ok', good: updatedGood });
  } catch (error) {
    console.error('[Error] Failed to update good sale info:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// отменить специальное предложение товара
app.post('/api/admin_cancel_sale_offer', async (req, res) => {
  try {
    const { goodId } = req.body;

    if (!goodId) {
      return res.status(400).json({ error: 'Good ID is required' });
    }

    // Получаем текущий товар
    const currentGood = await GoodsModel.findById(goodId);
    if (!currentGood) {
      return res.status(404).json({ error: 'Good not found' });
    }

    // Возвращаем оригинальную цену и отменяем акцию
    const updatedGood = await GoodsModel.findByIdAndUpdate(
      goodId,
      {
        isSaleNow: false,
        priceToShow_eu: currentGood.price_eu, // Возвращаем оригинальную цену
        saleInfo: {
          saleValue: null,
          infoForFront_de: null,
          infoForFront_en: null,
          infoForFront_ru: null
        }
      },
      { new: true }
    );

    if (!updatedGood) {
      return res.status(404).json({ error: 'Good not found' });
    }

    console.log('[Database] Good sale offer cancelled:', updatedGood._id);
    res.json({ status: 'ok', good: updatedGood });
  } catch (error) {
    console.error('[Error] Failed to cancel sale offer:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// создать новый тип товара
app.post('/api/admin_add_new_goodstype', async (req, res) => {
  try {
    const doc = new GoodsTypesModel({
      name_ru: req.body.name_ru,
      name_en: req.body.name_en,
      name_de: req.body.name_de,
    });

    await doc.save();

    return res.json({ status: 'ok', result: 'new goods type added' });
  } catch (err) {
    console.log(err);
  }
});

// //получить список типов товаров (для админа + юзера)
app.get('/api/user_get_goodsstype', async (req, res) => {
  try {
    const types = await GoodsTypesModel.find();

    return res.json(types);
  } catch (err) {
    console.log(err);
  }
});

// //получить список типов доставок - user
// app.get('/api/user_get_deliverystype', async (req, res) => {
//   try {

//     //  const goods = await GoodsModel.find().lean();
//     const types = await DeliveryTypesModel.find().lean();

//     const user = await UserModel.findOne({ tlgid: req.query.tlgid });
//     const userValute = user.valute;

//     const exchangeRates = await currencyConverter();

//     const newTypes = types.map((type) => ({
//       ...type,
//       valuteToShow: userValute,
//       priceToShow: parseFloat(
//         (type.price_eu * exchangeRates[userValute]).toFixed(0)
//       ),
//     }));

//     return res.json(newTypes);
//   } catch (err) {
//     console.log(err);
//   }
// });

//получить список типов доставок - admin
app.get('/api/admin_get_deliverystype', async (req, res) => {
  try {
    const types = await DeliveryTypesModel.find();

    return res.json(types);
  } catch (err) {
    console.log(err);
  }
});

//получить все товары - user
app.get('/api/user_get_goods', async (req, res) => {
  try {
    // const goods = await GoodsModel.find();

    const goods = await GoodsModel.find().lean();

    const user = await UserModel.findOne({ tlgid: req.query.tlgid });
    const userValute = user.valute;


    const exchangeRates = await currencyConverter();

    const newGoods = goods.map((good) => ({
      ...good,
      valuteToShow: userValute,
      basePriceToShowClientValute:parseFloat(
        (good.price_eu * exchangeRates[userValute]).toFixed(2)
      ), 
      priceToShow: parseFloat(
        (good.priceToShow_eu * exchangeRates[userValute]).toFixed(2)
      ),
    }));

    return res.json(newGoods);
  } catch (err) {
    console.log(err);
  }
});

//получить все товары - admin
app.get('/api/admin_get_goods', async (req, res) => {
  try {
    const goods = await GoodsModel.find();

    return res.json(goods);
  } catch (err) {
    console.log(err);
  }
});

//получить товар по id - user
app.get('/api/user_get_currentgood', async (req, res) => {
  try {
    const good = await GoodsModel.findById(req.query.id).lean();

    // const goods = await GoodsModel.find().lean();

    const user = await UserModel.findOne({ tlgid: req.query.tlgid });
    const userValute = user.valute;

    const exchangeRates = await currencyConverter();

    const newGood = {
      ...good,
      valuteToShow: userValute,
      basePriceToShowClientValute:parseFloat(
        (good.price_eu * exchangeRates[userValute]).toFixed(2)
      ),
      priceToShow: parseFloat(
        (good.priceToShow_eu * exchangeRates[userValute]).toFixed(2)
      ),
    };

    return res.json(newGood);

    // return res.json(good);
  } catch (err) {
    console.log(err);
  }
});

//получить товар по id - admin
app.get('/api/admin_get_currentgood', async (req, res) => {
  try {
    const good = await GoodsModel.findById(req.query.id).lean();

    // const goods = await GoodsModel.find().lean();

    // const user = await UserModel.findOne({ tlgid: req.query.tlgid });
    // const userValute = user.valute;

    // const exchangeRates = await currencyConverter();

    // const newGood = {
    //   ...good,
    //   valuteToShow: userValute,
    //   priceToShow: parseFloat(
    //     (good.price_eu * exchangeRates[userValute]).toFixed(0)
    //   ),
    // };

    return res.json(good);

    // return res.json(good);
  } catch (err) {
    console.log(err);
  }
});

//админ - редактировать товар
app.post('/api/admin_edit_good', upload.single('file'), async (req, res) => {
  console.log('[Request] Received upload request');

  try {
    const {
      id,
      article,
      name_de,
      name_ru,
      name_en,
      description_short_en,
      description_short_de,
      description_short_ru,
      description_long_en,
      description_long_de,
      description_long_ru,
      price_eu,
      delivery_price_de,
      delivery_price_inEu,
      delivery_price_outEu,
      type,
    } = req.body;

    await GoodsModel.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          article,
          name_de,
          name_en,
          name_ru,
          description_short_en,
          description_short_de,
          description_short_ru,
          description_long_en,
          description_long_de,
          description_long_ru,
          price_eu,
          delivery_price_de,
          delivery_price_inEu,
          delivery_price_outEu,
          type,

          ...(req.file && {
            file: {
              filename: req.file.filename,
              contentType: req.file.mimetype,
              size: req.file.size,
              url: `/uploads/${req.file.filename}`,
            },
          }),
        },
      }
    );

    res.status(201).json({ status: 'ok' });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

//админ - удалить товар
app.post('/api/admin_delete_good', async (req, res) => {
  try {
    const result = await GoodsModel.deleteOne({ _id: req.body.id });

    res.status(201).json({ status: 'ok', message: 'item deleted' });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

app.post('/api/admin_update_filters', async (req, res) => {
  try {
    const typesArray = req.body.arrayTypes;

    // Используем map для создания массива промисов и Promise.all для их выполнения
    const updatePromises = typesArray.map(async (element) => {
      try {
        const result = await GoodsTypesModel.findOneAndUpdate(
          { _id: element.id },
          {
            $set: {
              name_en: element.name_en,
              name_de: element.name_de,
              name_ru: element.name_ru,
            },
          },
          { new: true } // опционально: возвращает обновлённый документ
        );

        if (!result) {
          console.warn(`Document with id ${element.id} not found`);
        }
        return result;
      } catch (error) {
        console.error(`Error updating document ${element.id}:`, error);
        throw error; // Пробрасываем ошибку для обработки в Promise.all
      }
    });

    await Promise.all(updatePromises);

    res.status(200).json({ status: 'ok', message: 'items updated' });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// создать новый тип для фильтра
app.post('/api/admin_add_new_type', async (req, res) => {
  try {
    const document = new GoodsTypesModel({
      name_de: req.body.array.name_de,
      name_en: req.body.array.name_en,
      name_ru: req.body.array.name_ru,
    });

    await document.save();

    res.status(201).json({ status: 'ok' });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// создать новый тип доставки
app.post('/api/admin_add_new_delivery', async (req, res) => {
  try {
    const document = new DeliveryTypesModel({
      name_de: req.body.array.name_de,
      name_en: req.body.array.name_en,
      name_ru: req.body.array.name_ru,
      comments_de: req.body.array.comments_de,
      comments_en: req.body.array.comments_en,
      comments_ru: req.body.array.comments_ru,
      price_eu: req.body.array.price_eu,
    });

    await document.save();

    res.status(201).json({ status: 'ok' });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

app.post('/api/admin_update_deliverytypes', async (req, res) => {
  try {
    const typesArray = req.body.arrayTypes;

    // Используем map для создания массива промисов и Promise.all для их выполнения
    const updatePromises = typesArray.map(async (element) => {
      try {
        const result = await DeliveryTypesModel.findOneAndUpdate(
          { _id: element.id },
          {
            $set: {
              name_en: element.name_en,
              name_de: element.name_de,
              name_ru: element.name_ru,
              price_eu: element.price_eu,
              comments_en: element.comments_en,
              comments_de: element.comments_de,
              comments_ru: element.comments_ru,
            },
          },
          { new: true } // опционально: возвращает обновлённый документ
        );

        if (!result) {
          console.warn(`Document with id ${element.id} not found`);
        }
        return result;
      } catch (error) {
        console.error(`Error updating document ${element.id}:`, error);
        throw error; // Пробрасываем ошибку для обработки в Promise.all
      }
    });

    await Promise.all(updatePromises);

    res.status(200).json({ status: 'ok', message: 'items updated' });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

//действия с корзиной
app.post('/api/user_add_good_tocart', async (req, res) => {
  try {
    const { userid, goodsarray, action } = req.body;
    const cart = await CartsModel.findOne({ tlgid: userid });

    if (!cart) {
      const user = await UserModel.findOne({ tlgid: userid });
      const jbid = user.jbid;

      if (action === 'plus') {
        // Создаем новую корзину только для действия "plus"
        const newCart = new CartsModel({
          tlgid: userid,
          goods: goodsarray,
          jbid: jbid,
        });
        await newCart.save();
        return res.status(200).json({ status: 'ok', action: 'cart created' });
      }
      return res.status(200).json({
        status: 'ok',
        action: 'no cart',
        message: 'Корзина не существует',
      });
    }

    // Находим индекс товара в корзине
    const existingItemIndex = cart.goods.findIndex((item) =>
      item.itemId.equals(goodsarray[0].itemId)
    );

    if (existingItemIndex === -1) {
      if (action === 'plus') {
        // Добавляем новый товар только для действия "plus"
        cart.goods.push(goodsarray[0]);
        console.log('Товара нет, добавляем новый');
      } else {
        return res.status(200).json({
          status: 'ok',
          action: 'not found',
          message: 'Товар не найден в корзине',
        });
      }
    } else {
      // Обрабатываем существующий товар в зависимости от action
      switch (action) {
        case 'plus':
          cart.goods[existingItemIndex].qty += 1;
          console.log('Товар есть, увеличиваем количество');
          break;
        case 'minus':
          if (cart.goods[existingItemIndex].qty > 1) {
            cart.goods[existingItemIndex].qty -= 1;
            console.log('Товар есть, уменьшаем количество');
          } else {
            // Если количество = 1, то удаляем товар при minus
            cart.goods.splice(existingItemIndex, 1);
            console.log('Удаляем товар, так как количество = 1');
          }
          break;
        case 'delete':
          cart.goods.splice(existingItemIndex, 1);
          console.log('Удаляем товар по запросу');
          break;
        default:
          // Если action не распознан, просто обновляем количество
          cart.goods[existingItemIndex].qty = goodsarray[0].qty;
      }
    }

    // Сохраняем изменения
    await cart.save();

    // Проверяем, остались ли товары в корзине
    if (cart.goods.length === 0) {
      await CartsModel.deleteOne({ tlgid: userid });
      return res.status(200).json({ status: 'ok', action: 'cart deleted' });
    }

    res.status(200).json({ status: 'ok', action: 'cart updated' });
  } catch (error) {
    console.error('[Error]', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

//показать корзину пользователя
app.get('/api/user_get_mycart', async (req, res) => {
  try {
    const cart = await CartsModel.findOne({ tlgid: req.query.tlgid }).lean();
    if (!cart)
      return res.json({ status: 'ok', goods: [], totalQty: 0, totalPrice: 0 });

    const user = await UserModel.findOne({ tlgid: req.query.tlgid });
    const userValute = user.valute;
    const exchangeRates = await currencyConverter();

    // Используем Promise.all для параллельной загрузки товаров
    const goodsWithDetails = await Promise.all(
      cart.goods.map(async (item) => {
        try {
          const good = await GoodsModel.findById(item.itemId);
          if (!good) {
            console.warn(`Товар с ID ${item.itemId} не найден`);
            return null;
          }
          const itemPrice = Number(good.priceToShow_eu);
          const convertedPrice = Number(
            itemPrice * exchangeRates[userValute]
          ).toFixed(2);
          const itemQty = Number(item.qty);

          const deliveryPriceDe = Number(good.delivery_price_de);
          const deliveryPriceInEu = Number(good.delivery_price_inEu);
          const deliveryPriceOutEu = Number(good.delivery_price_outEu);

          const deliveryPriceToShow_de = Number(
            deliveryPriceDe * exchangeRates[userValute]
          ).toFixed(2);
          const deliveryPriceToShow_inEu = Number(
            deliveryPriceInEu * exchangeRates[userValute]
          ).toFixed(2);
          const deliveryPriceToShow_outEu = Number(
            deliveryPriceOutEu * exchangeRates[userValute]
          ).toFixed(2);


          return {
            name_en: good.name_en,
            name_de: good.name_de,
            name_ru: good.name_ru,
            price_eu: itemPrice,
            priceToShow: convertedPrice,
            deliveryPriceToShow_de: deliveryPriceToShow_de,
            deliveryPriceToShow_inEu: deliveryPriceToShow_inEu,
            deliveryPriceToShow_outEu: deliveryPriceToShow_outEu,
            deliveryPriceEU_de: deliveryPriceDe,
            deliveryPriceEU_inEu: deliveryPriceInEu,
            deliveryPriceEU_outEu: deliveryPriceOutEu,
            qty: itemQty,
            itemId: item.itemId,
            img: good.file?.url || null,
            totalpriceItem: (convertedPrice * itemQty).toFixed(2),
            valuteToShow: userValute,
            isSaleNow: good.isSaleNow,
            
          };
        } catch (error) {
          console.error(`Ошибка при загрузке товара ${item.itemId}:`, error);
          return null;
        }
      })
    );

    // Фильтруем null значения (если какие-то товары не найдены)
    const filteredGoods = goodsWithDetails.filter((item) => item !== null);

    // Рассчитываем общее количество товаров и общую сумму
    const totalQty = filteredGoods.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = filteredGoods.reduce(
      (sum, item) => sum + Number(item.totalpriceItem),
      0
    );

    return res.json({
      status: 'ok',
      goods: filteredGoods,
      totalQty: totalQty,
      valuteToShow: userValute,
      totalPriceCart: parseFloat(totalPrice.toFixed(2)), // Округляем до 2 знаков после запятой
    });
  } catch (err) {
    console.error('Ошибка в /api/user_get_mycart:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
});

// смена валюты в БД
app.post('/api/change_valute', async (req, res) => {
  try {
    await UserModel.findOneAndUpdate(
      { tlgid: req.body.tlgid },
      { $set: { valute: req.body.valute } }
    );

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Ошибка в /api/change_valute', err);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
});

// смена языка в БД
app.post('/api/change_language', async (req, res) => {
  try {
    await UserModel.findOneAndUpdate(
      { tlgid: req.body.tlgid },
      { $set: { language: req.body.language } }
    );

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Ошибка в /api/change_language', err);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
});

async function currencyConverter() {
  const balance1 = await Convert(1).from('EUR').to('USD');
  const balance2 = await Convert(1).from('EUR').to('RUB');

  const exchangeRates = {
    '€': 1,
    $: balance1,
    '₽': balance2,
  };

  return exchangeRates;
}

//получить все корзины - admin
// app.get('/api/admin_get_carts', async (req, res) => {
//   try {
//     const carts = await CartsModel.find().sort({ updatedAt: -1 });

//     const qtyItems = carts.length

//     const formatDate = (isoString) => {
//       const date = new Date(isoString);
//       const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
//                      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

//       const day = String(date.getUTCDate()).padStart(2, '0');
//       const month = months[date.getUTCMonth()];
//       const year = date.getUTCFullYear();
//       const hours = String(date.getUTCHours()).padStart(2, '0');
//       const minutes = String(date.getUTCMinutes()).padStart(2, '0');

//       return `${day} ${month} ${year} ${hours}:${minutes}Z`;
//     };

//     const cartsWithFormattedDates = carts.map(item => ({
//       ...item.toObject(), // Преобразуем Mongoose документ в обычный объект
//       formattedDate: formatDate(item.updatedAt)
//     }));

//     return res.json({carts:cartsWithFormattedDates,qtyItems:qtyItems} );
//   } catch (err) {
//     console.error('Error in /api/admin_get_carts:', err);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// });

app.get('/api/admin_get_carts', async (req, res) => {
  try {
    let carts = await CartsModel.aggregate([
      {
        $sort: { updatedAt: -1 },
      },
      {
        $lookup: {
          from: 'goods', // название коллекции с товарами
          localField: 'goods.itemId', // поле в корзине с id товара
          foreignField: '_id', // поле в коллекции товаров
          as: 'goodsInfo', // временное поле с информацией о товарах
        },
      },
      {
        $addFields: {
          goods: {
            $map: {
              input: '$goods',
              as: 'good',
              in: {
                $mergeObjects: [
                  '$$good',
                  {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$goodsInfo',
                          as: 'info',
                          cond: { $eq: ['$$info._id', '$$good.itemId'] },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            },
          },
          formattedDate: {
            $dateToString: {
              format: '%d %b %Y %H:%MZ',
              date: '$updatedAt',
              timezone: 'UTC',
            },
          },
        },
      },
      {
        $project: {
          goodsInfo: 0, // удаляем временное поле
        },
      },
    ]);

    let grandTotal = 0; // Общая сумма всех корзин

    carts = carts.map((cart) => {
      const total = cart.goods.reduce((sum, good) => {
        return sum + (good.price_eu || 0) * (good.qty || 0);
      }, 0);

      grandTotal += total; // Добавляем к общей сумме
      const qtyItemsInCart = cart.goods.length;

      return {
        ...cart,
        totalAmount: total,
        qtyItemsInCart: qtyItemsInCart,
      };
    });

    const qtyItems = carts.length;

    return res.json({
      carts,
      qtyItems,
      grandTotal, // Общая сумма всех корзин
    });
  } catch (err) {
    console.error('Error in /api/admin_get_carts:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

//получить список всех стран для доставки - admin
app.get('/api/admin_get_countries', async (req, res) => {
  try {
    const countries = await CountriesForDeliveryModel.find();

    return res.json(countries);
  } catch (err) {
    console.log(err);
  }
});

// создать новую страну для доставки
app.post('/api/admin_add_new_country', async (req, res) => {
  try {
    const document = new CountriesForDeliveryModel({
      name_de: req.body.array.name_de,
      name_en: req.body.array.name_en,
      name_ru: req.body.array.name_ru,
      isEU: req.body.array.isEU,
    });

    await document.save();

    res.status(201).json({ status: 'ok' });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// обновить одну страну для доставки
app.post('/api/admin_update_country', async (req, res) => {
  try {
    const { id, name_en, name_de, name_ru, isEU } = req.body;

    const result = await CountriesForDeliveryModel.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          name_en,
          name_de,
          name_ru,
          isEU,
        },
      },
      { new: true }
    );

    if (!result) {
      console.warn(`Country with id ${id} not found`);
      return res
        .status(404)
        .json({ status: 'error', message: 'Country not found' });
    }

    res
      .status(200)
      .json({ status: 'ok', message: 'country updated', data: result });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// создать заказ и удалить корзину
app.post('/api/create_order', async (req, res) => {
  try {
    const { tlgid, goods, country, regionDelivery, address, phone, name } =
      req.body;

    const user = await UserModel.findOne({ tlgid: tlgid });
    const jbid = user.jbid;

    // Находим статус "new" или используем дефолтный
    let defaultStatus = await OrdersStatusSchema.findOne({ name_en: 'new' });
    if (!defaultStatus) {
      // Если нет статуса "new", создаем его
      defaultStatus = new OrdersStatusSchema({
        name_en: 'new',
        name_ru: 'новый',
        name_de: 'neu',
        numForFilter: 1,
      });
      await defaultStatus.save();
    }

    // Создаем новый заказ
    const newOrder = new OrdersModel({
      tlgid: tlgid,
      jbid: jbid,
      goods: goods,
      country: country,
      regionDelivery: regionDelivery,
      adress: address, // Note: keeping 'adress' spelling to match model
      phone: phone,
      name: name,
      orderStatus: defaultStatus._id,
      payStatus: false,
    });

    await newOrder.save();

    // Удаляем корзину пользователя
    await CartsModel.deleteOne({ tlgid: tlgid });

    res.status(201).json({
      status: 'ok',
      message: 'Order created successfully',
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error('[Error] Full error:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// получить заказы пользователя
app.get('/api/user_get_my_orders', async (req, res) => {
  try {
    const { tlgid } = req.query;

    if (!tlgid) {
      return res
        .status(400)
        .json({ status: 'error', message: 'tlgid is required' });
    }

    // Находим заказы пользователя с детализацией товаров и статусов
    const orders = await OrdersModel.find({ tlgid: tlgid })
      .populate('goods.itemId')
      .populate('orderStatus')
      .sort({ createdAt: -1 })
      .lean();

    // Получаем информацию о пользователе для валюты
    const user = await UserModel.findOne({ tlgid: tlgid });
    const userValute = user?.valute;
    const exchangeRates = await currencyConverter();

    // Обогащаем данные о заказах
    const ordersWithDetails = orders.map((order) => {
      const goodsWithDetails = order.goods
        .map((item) => {
          const good = item.itemId;
          if (!good) return null;

          // const itemPrice = Number(good.price_eu) || 0;
          const itemPrice = Number(item.actualPurchasePriceInEu) || 0;
          const convertedPrice = Number(
            itemPrice * exchangeRates[userValute]
          ).toFixed(2);

          // Получаем цену доставки в зависимости от regionDelivery
          const deliveryPriceEur =
            Number(good[`delivery_price_${order.regionDelivery}`]) || 0;
          const convertedDeliveryPrice = Number(
            deliveryPriceEur * exchangeRates[userValute]
          ).toFixed(2);

          return {
            ...item,
            name_en: good.name_en,
            name_de: good.name_de,
            name_ru: good.name_ru,
            price_eu: itemPrice,
            priceToShow: convertedPrice,
            delivery_price_de: good.delivery_price_de,
            delivery_price_inEu: good.delivery_price_inEu,
            delivery_price_outEu: good.delivery_price_outEu,
            convertedDeliveryPrice: convertedDeliveryPrice,
            valuteToShow: userValute,
          };
        })
        .filter((item) => item !== null);

      return {
        ...order,
        goods: goodsWithDetails,
        valuteToShow: userValute,
      };
    });

    res.json({ orders: ordersWithDetails, valuteToShow: userValute });
  } catch (error) {
    console.error('[Error] Full error:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// получить все заказы - admin
app.get('/api/admin_get_orders', async (req, res) => {
  try {
    // Находим все заказы с детализацией товаров и статусов
    const orders = await OrdersModel.find()
      .populate('goods.itemId')
      .populate('orderStatus')
      .sort({ createdAt: -1 })
      .lean();

    // console.log("ORDERS", orders.goods)

    // Обогащаем данные о заказах для админки
    const ordersWithDetails = orders.map((order) => {
      const goodsWithDetails = order.goods
        .map((item) => {
          const good = item.itemId;
          if (!good) {
            // Если товар был удален, возвращаем базовую информацию
            return {
              ...item,
              name_en: 'Deleted product',
              name_de: 'Gelöschtes Produkt',
              name_ru: 'Удаленный товар',
              price_eu: item.actualPurchasePriceInEu || 0,
              actualPurchasePriceInEu: item.actualPurchasePriceInEu || 0,
              delivery_price_de: 0,
              delivery_price_inEu: 0,
              delivery_price_outEu: 0,
              file: { url: '/uploads/deleted-product.png' },
            };
          }

          return {
            ...item,
            name_en: good.name_en,
            name_de: good.name_de,
            name_ru: good.name_ru,
            price_eu: good.price_eu,
            actualPurchasePriceInEu: item.actualPurchasePriceInEu || good.price_eu,
            delivery_price_de: good.delivery_price_de,
            delivery_price_inEu: good.delivery_price_inEu,
            delivery_price_outEu: good.delivery_price_outEu,
            file: good.file,
          };
        });

      // Рассчитываем общую стоимость заказа
      const totalAmount = goodsWithDetails.reduce((sum, item) => {
        // const itemPrice = Number(item.price_eu) || 0;
        const itemPrice = Number(item.actualPurchasePriceInEu) || 0;
        const deliveryPrice =
          Number(item[`delivery_price_${order.regionDelivery}`]) || 0;
        const quantity = Number(item.qty) || 0;

        return sum + (itemPrice + deliveryPrice) * quantity;
      }, 0);

      const qtyItemsInOrder = goodsWithDetails.length;

      // Форматируем дату
      const formattedDate = new Date(order.createdAt).toLocaleDateString(
        'en-GB',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }
      );

      return {
        ...order,
        goods: goodsWithDetails,
        totalAmount: totalAmount,
        qtyItemsInOrder: qtyItemsInOrder,
        formattedDate: formattedDate,
      };
    });

    const qtyOrders = orders.length;
    const grandTotal = ordersWithDetails.reduce(
      (sum, order) => sum + order.totalAmount,
      0
    );

    res.json({
      orders: ordersWithDetails,
      qtyOrders,
      grandTotal,
    });
  } catch (error) {
    console.error('[Error] Full error:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// создать статусы заказов

app.post('/api/admin_create_orderstatus', async (req, res) => {
  const document = new OrdersStatusSchema({
    name_de: 'fertig',
    name_en: 'done',
    name_ru: 'доставлен',
    numForFilter: 4,
  });

  await document.save();
});

// получить все статусы заказов - admin
app.get('/api/admin_get_order_statuses', async (req, res) => {
  try {
    const statuses = await OrdersStatusSchema.find().sort({ numForFilter: 1 });
    res.json(statuses);
  } catch (error) {
    console.error('[Error] Full error:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// обновить статус заказа - admin
app.post('/api/admin_update_order_status', async (req, res) => {
  try {
    const { orderId, statusId, eta } = req.body;

    if (!orderId || !statusId) {
      return res.status(400).json({
        status: 'error',
        message: 'orderId and statusId are required',
      });
    }

    // Подготавливаем объект для обновления
    const updateData = { orderStatus: statusId };
    
    // Если передана eta, добавляем её в объект обновления
    if (eta !== undefined) {
      updateData.eta = eta;
    }

    const result = await OrdersModel.findOneAndUpdate(
      { _id: orderId },
      { $set: updateData },
      { new: true }
    ).populate('orderStatus');

    if (!result) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    res.json({
      status: 'ok',
      message: 'Order status updated successfully',
      order: result,
    });
  } catch (error) {
    console.error('[Error] Full error:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// создать Stripe Checkout Session для оплаты
app.post('/api/create_payment_session', async (req, res) => {
  try {
    const { cart, deliveryInfo, totalSum, region, tlgid } = req.body;

    if (!cart || !deliveryInfo || !totalSum || !tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'Cart, delivery info, total sum and tlgid are required',
      });
    }

    // Создаем line items для Stripe из товаров корзины
    const lineItems = cart.map((item) => {
      const itemPrice = Number(item.price_eu);
      const deliveryPrice = Number(item[`deliveryPriceEU_${region}`]);
      const totalItemPrice = (itemPrice + deliveryPrice) * item.qty * 100; // Stripe работает в центах

      return {
        price_data: {
          currency: 'eur',
          product_data: {
            name: item[`name_en`] || item.name_en,
            description: `Delivery to ${deliveryInfo.selectedCountry.name_en}`,
          },
          unit_amount: Math.round(totalItemPrice / item.qty), // Цена за единицу включая доставку
        },
        quantity: item.qty,
      };
    });

    console.log('lineItems', lineItems);

    // Создаем Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/#/success-page?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/#/cancellpay-page`,
      metadata: {
        tlgid: tlgid.toString(),
        deliveryInfo: JSON.stringify(deliveryInfo),
        region: region,
        totalSum: totalSum.toString(),
      },
    });

    // Получаем информацию о пользователе
    const user = await UserModel.findOne({ tlgid: tlgid });
    const jbid = user?.jbid;

    // Находим статус "new" или используем дефолтный
    let defaultStatus = await OrdersStatusSchema.findOne({ name_en: 'new' });
    if (!defaultStatus) {
      // Если нет статуса "new", создаем его
      defaultStatus = new OrdersStatusSchema({
        name_en: 'new',
        name_ru: 'новый',
        name_de: 'neu',
        numForFilter: 1,
      });
      await defaultStatus.save();
    }

    // Создаем заказ с stripeSessionId, но payStatus=false до подтверждения
    const newOrder = new OrdersModel({
      tlgid: tlgid,
      jbid: jbid,
      goods: cart.map((item) => ({
        itemId: item.itemId,
        qty: item.qty,
        actualPurchasePriceInEu: item.price_eu,
        isPurchasedBySale: item.isSaleNow
      })),
      country: deliveryInfo.selectedCountry.name_en,
      regionDelivery: region,
      adress: deliveryInfo.address, // Note: keeping 'adress' spelling to match model
      phone: deliveryInfo.phone,
      name: deliveryInfo.userName,
      orderStatus: defaultStatus._id,
      payStatus: false, // Будет изменено на true через webhook
      stripeSessionId: session.id, // Сохраняем session ID для webhook
    });

    await newOrder.save();

    // Удаляем корзину пользователя
    await CartsModel.deleteOne({ tlgid: tlgid });

    res.json({
      status: 'ok',
      sessionId: session.id,
      url: session.url,
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error('[Stripe Error] Full error:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// Повторная оплата существующего заказа
app.post('/api/repay_order', async (req, res) => {
  try {
    const { orderId, tlgid } = req.body;

    if (!orderId || !tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'Order ID and tlgid are required',
      });
    }

    // Ищем заказ в базе данных
    const order = await OrdersModel.findById(orderId)
      .populate('goods.itemId')
      .lean();

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Проверяем, что заказ принадлежит пользователю
    if (order.tlgid !== tlgid) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
    }

    // Если заказ уже оплачен, возвращаем ошибку
    if (order.payStatus === true) {
      return res.status(400).json({
        status: 'error',
        message: 'Order is already paid',
      });
    }

    // Создаем line items для Stripe из товаров заказа
    const lineItems = order.goods.map((item) => {
      const good = item.itemId;
      const itemPrice = Number(item.actualPurchasePriceInEu);
      const deliveryPrice = Number(
        good[`delivery_price_${order.regionDelivery}`]
      );
      const totalItemPrice = (itemPrice + deliveryPrice) * item.qty * 100; // Stripe работает в копейках/центах

      return {
        price_data: {
          currency: 'eur',
          product_data: {
            name: good.name_en,
            description: `Delivery to ${order.country}`,
          },
          unit_amount: Math.round(totalItemPrice / item.qty), // Цена за единицу включая доставку
        },
        quantity: item.qty,
      };
    });

    // Создаем новую Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/#/success-page?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/#/orders`,
      metadata: {
        orderId: orderId,
        tlgid: tlgid.toString(),
        repayment: 'true',
      },
    });

    // Обновляем stripeSessionId в существующем заказе
    await OrdersModel.findByIdAndUpdate(orderId, {
      stripeSessionId: session.id,
    });

    res.json({
      status: 'ok',
      sessionId: session.id,
      url: session.url,
      orderId: orderId,
    });
  } catch (error) {
    console.error('[Repay Order Error] Full error:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// Получить данные пользователя
app.get('/api/user_get_profile', async (req, res) => {
  try {
    const { tlgid } = req.query;

    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'tlgid is required',
      });
    }

    // Ищем пользователя в базе данных
    const user = await UserModel.findOne({ tlgid: Number(tlgid) }).lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    res.json({
      status: 'ok',
      user: {
        tlgid: user.tlgid,
        name: user.name || '',
        phone: user.phone || '',
        adress: user.adress || '', // Keeping original spelling
      },
    });
  } catch (error) {
    console.error('[Get User Profile Error]:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// Обновить данные пользователя
app.post('/api/user_update_profile', async (req, res) => {
  try {
    const { tlgid, name, phone, adress } = req.body;

    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'tlgid is required',
      });
    }

    // Обновляем пользователя в базе данных
    const updatedUser = await UserModel.findOneAndUpdate(
      { tlgid: Number(tlgid) },
      {
        $set: {
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(adress !== undefined && { adress }),
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    res.json({
      status: 'ok',
      message: 'Profile updated successfully',
      user: {
        tlgid: updatedUser.tlgid,
        name: updatedUser.name || '',
        phone: updatedUser.phone || '',
        adress: updatedUser.adress || '',
      },
    });
  } catch (error) {
    console.error('[Update User Profile Error]:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// получить чек по payment_intent
app.get('/api/get_receipt', async (req, res) => {
  try {
    const { payment_intent } = req.query;

    if (!payment_intent) {
      return res
        .status(400)
        .json({ status: 'error', message: 'payment_intent is required' });
    }

    // Ищем чек в базе данных по payment_intent
    const receipt = await ReceiptsModel.findOne({ 
      payment_intent: payment_intent 
    });

    if (!receipt) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Receipt not found' });
    }

    // Возвращаем URL чека
    res.json({ 
      status: 'ok', 
      url: receipt.url 
    });

  } catch (error) {
    console.error('[Error] Get receipt error:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

// получить данные об акции
app.get('/api/get_sale_info', async (req, res) => {
  try {
    // Получаем последнюю созданную акцию с данными о товаре
    const sale = await SaleModel.findOne()
      .populate('good')
      .sort({ createdAt: -1 });

    if (!sale) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Sale not found' });
    }

    res.json({ 
      status: 'ok', 
      sale: sale 
    });

  } catch (error) {
    console.error('[Error] Get sale info error:', error);
    res.status(500).json({
      status: 'server error',
      message: error.message,
    });
  }
});

/////////////////////

app.listen(PORT, (err) => {
  if (err) {
    return console.log(err);
  }
  console.log('server SHOP has been started');
});

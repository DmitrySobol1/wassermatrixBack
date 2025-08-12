import express from 'express';
import mongoose from 'mongoose';
import UserModel from './models/user.js';
import GoodsModel from './models/goods.js';
import GoodsTypesModel from './models/goodsTypes.js';
import DeliveryTypesModel from './models/deliveryTypes.js';
import CartsModel from './models/carts.js';
import CountriesForDeliveryModel from './models/countriesForDelivery.js';
import OrdersModel from './models/orders.js';
import OrdersStatusSchema from './models/ordersStatus.js'

import { Convert } from 'easy-currencies';

// для файлов
import multer from 'multer';

import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import https from 'https';

const PORT = process.env.PORT || 4444;

import { TEXTS } from './texts.js';
import goods from './models/goods.js';

// const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB SHOP - OK'))
  .catch((err) => console.log('db error:', err));

const app = express();

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

    //создание юзера
    if (!user) {
      await createNewUser(req.body.tlgid, req.body.jbid);
      const userData = { result: 'showOnboarding' };
      return res.json({ userData });
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

    // if (!title) {
    //   console.error('[Validation] title is required');
    //   return res.status(400).json({ error: 'title is required' });
    // }

    // if (!description) {
    //   console.error('[Validation] description is required');
    //   return res.status(400).json({ error: 'description is required' });
    // }

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

// создать новый товар - OLD version (без добавления картинки)
// app.post('/api/admin_add_new_good', async (req, res) => {
//   try {
//     const doc = new GoodsModel({
//       article: req.body.article,
//       name_ru: req.body.name_ru,
//       name_en: req.body.name_en,
//       name_de: req.body.name_de,

//       description_short_en: req.body.description_short_en,
//       description_short_de: req.body.description_short_de,
//       description_short_ru: req.body.description_short_ru,

//       description_long_en: req.body.description_long_en,
//       description_long_de: req.body.description_long_de,
//       description_long_ru: req.body.description_long_ru,

//       price_eu: req.body.price_eu,
//       img: req.body.img,
//       type: req.body.type,
//     });

//     await doc.save();

//     return res.json({ status: 'ok', result: 'new good added' });
//   } catch (err) {
//     console.log(err);
//   }
// });

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

    // $ € ₽

    //FIXME: создать функцию по запросу стоимости валют
    // const EXCHANGE_RATES = {
    //   '€': 1,
    //   '$': 1.07,
    //   '₽': 100
    // };

    const exchangeRates = await currencyConverter();

    const newGoods = goods.map((good) => ({
      ...good,
      valuteToShow: userValute,
      priceToShow: parseFloat(
        (good.price_eu * exchangeRates[userValute]).toFixed(0)
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
      priceToShow: parseFloat(
        (good.price_eu * exchangeRates[userValute]).toFixed(0)
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
          const itemPrice = Number(good.price_eu);
          const convertedPrice = Number(
            itemPrice * exchangeRates[userValute]
          ).toFixed(0);
          const itemQty = Number(item.qty);

          const deliveryPriceDe=Number(good.delivery_price_de)
          const deliveryPriceInEu=Number(good.delivery_price_inEu)
          const deliveryPriceOutEu=Number(good.delivery_price_outEu)

          const deliveryPriceToShow_de = Number(deliveryPriceDe * exchangeRates[userValute]).toFixed(0);
          const deliveryPriceToShow_inEu = Number(deliveryPriceInEu * exchangeRates[userValute]).toFixed(0);
          const deliveryPriceToShow_outEu = Number(deliveryPriceOutEu * exchangeRates[userValute]).toFixed(0);

          return {
            name_en: good.name_en,
            name_de: good.name_de,
            name_ru: good.name_ru,
            price_eu: itemPrice,
            priceToShow: convertedPrice,
            deliveryPriceToShow_de: deliveryPriceToShow_de, 
            deliveryPriceToShow_inEu: deliveryPriceToShow_inEu,
            deliveryPriceToShow_outEu: deliveryPriceToShow_outEu,
            qty: itemQty,
            itemId: item.itemId,
            img: good.file?.url || null,
            totalpriceItem: convertedPrice * itemQty,
            valuteToShow: userValute,
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
      (sum, item) => sum + item.totalpriceItem,
      0
    );

    return res.json({
      status: 'ok',
      goods: filteredGoods,
      totalQty: totalQty,
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
      return res.status(404).json({ status: 'error', message: 'Country not found' });
    }

    res.status(200).json({ status: 'ok', message: 'country updated', data: result });
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
    const { tlgid, goods, country, regionDelivery, address, phone, name } = req.body;

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
        numForFilter: 1
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
      payStatus: false
    });

    await newOrder.save();

    // Удаляем корзину пользователя
    await CartsModel.deleteOne({ tlgid: tlgid });

    res.status(201).json({ 
      status: 'ok', 
      message: 'Order created successfully',
      orderId: newOrder._id
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
      return res.status(400).json({ status: 'error', message: 'tlgid is required' });
    }

    // Находим заказы пользователя с детализацией товаров и статусов
    const orders = await OrdersModel.find({ tlgid: tlgid })
      .populate('goods.itemId')
      .populate('orderStatus')
      .sort({ createdAt: -1 })
      .lean();

    // Получаем информацию о пользователе для валюты
    const user = await UserModel.findOne({ tlgid: tlgid });
    const userValute = user?.valute || '€';
    const exchangeRates = await currencyConverter();

    // Обогащаем данные о заказах
    const ordersWithDetails = orders.map((order) => {
      const goodsWithDetails = order.goods.map((item) => {
        const good = item.itemId;
        if (!good) return null;

        const itemPrice = Number(good.price_eu) || 0;
        const convertedPrice = Number(itemPrice * exchangeRates[userValute]).toFixed(0);
        
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
          valuteToShow: userValute,
        };
      }).filter(item => item !== null);

      return {
        ...order,
        goods: goodsWithDetails,
        valuteToShow: userValute
      };
    });

    res.json(ordersWithDetails);
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

    // Обогащаем данные о заказах для админки
    const ordersWithDetails = orders.map((order) => {
      const goodsWithDetails = order.goods.map((item) => {
        const good = item.itemId;
        if (!good) return null;

        return {
          ...item,
          name_en: good.name_en,
          name_de: good.name_de,
          name_ru: good.name_ru,
          price_eu: good.price_eu,
          delivery_price_de: good.delivery_price_de,
          delivery_price_inEu: good.delivery_price_inEu,
          delivery_price_outEu: good.delivery_price_outEu,
          file: good.file,
        };
      }).filter(item => item !== null);

      // Рассчитываем общую стоимость заказа
      const totalAmount = goodsWithDetails.reduce((sum, item) => {
        const itemPrice = Number(item.price_eu) || 0;
        const deliveryPrice = Number(item[`delivery_price_${order.regionDelivery}`]) || 0;
        const quantity = Number(item.qty) || 0;
        
        return sum + ((itemPrice + deliveryPrice) * quantity);
      }, 0);

      const qtyItemsInOrder = goodsWithDetails.length;

      // Форматируем дату
      const formattedDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        ...order,
        goods: goodsWithDetails,
        totalAmount: totalAmount,
        qtyItemsInOrder: qtyItemsInOrder,
        formattedDate: formattedDate
      };
    });

    const qtyOrders = orders.length;
    const grandTotal = ordersWithDetails.reduce((sum, order) => sum + order.totalAmount, 0);

    res.json({
      orders: ordersWithDetails,
      qtyOrders,
      grandTotal
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
      numForFilter: 4
      
    });

    await document.save();
})

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
    const { orderId, statusId } = req.body;

    if (!orderId || !statusId) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'orderId and statusId are required' 
      });
    }

    const result = await OrdersModel.findOneAndUpdate(
      { _id: orderId },
      { $set: { orderStatus: statusId } },
      { new: true }
    ).populate('orderStatus');

    if (!result) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Order not found' 
      });
    }

    res.json({ 
      status: 'ok', 
      message: 'Order status updated successfully',
      order: result
    });
  } catch (error) {
    console.error('[Error] Full error:', error);
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

import express from 'express';
import mongoose from 'mongoose';
import UserModel from './models/user.js';
import GoodsModel from './models/goods.js';
import GoodsTypesModel from './models/goodsTypes.js';
import CartsModel from './models/carts.js';

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
      await createNewUser(req.body.tlgid);
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

async function createNewUser(tlgid) {
  try {
    const doc = new UserModel({
      tlgid: tlgid,
      valute: 'eur',
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

//получить список типов товаров
app.get('/api/user_get_goodsstype', async (req, res) => {
  try {
    const types = await GoodsTypesModel.find();

    return res.json(types);
  } catch (err) {
    console.log(err);
  }
});

//получить все товары
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

//получить товар по id
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

//действия с корзиной
app.post('/api/user_add_good_tocart', async (req, res) => {
  try {
    const { userid, goodsarray, action } = req.body;
    const cart = await CartsModel.findOne({ tlgid: userid });

    if (!cart) {
      if (action === 'plus') {
        // Создаем новую корзину только для действия "plus"
        const newCart = new CartsModel({
          tlgid: userid,
          goods: goodsarray,
        });
        await newCart.save();
        return res.status(200).json({ status: 'ok', action: 'cart created' });
      }
      return res
        .status(200)
        .json({
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


    // const good = await GoodsModel.findById(req.query.id).lean();

    // const goods = await GoodsModel.find().lean();

    const user = await UserModel.findOne({ tlgid: req.query.tlgid });
    const userValute = user.valute;
    const exchangeRates = await currencyConverter();


    // const newGood = {
    //   ...good,
    //   valuteToShow: userValute,
    //   priceToShow: parseFloat(
    //     (good.price_eu * exchangeRates[userValute]).toFixed(0)
    //   ),
    // };



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
          const convertedPrice = Number((itemPrice*exchangeRates[userValute])).toFixed(0)
          const itemQty = Number(item.qty);

          return {
            name_en: good.name_en,
            name_de: good.name_de,
            name_ru: good.name_ru,
            price_eu: itemPrice,
            priceToShow: convertedPrice,
            qty: itemQty,
            itemId: item.itemId,
            img: good.file?.url || null,
            totalpriceItem: convertedPrice * itemQty,
            valuteToShow:userValute
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

  return res.json({status: 'ok'});
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

  return res.json({status: 'ok'});
}catch (err) {
    console.error('Ошибка в /api/change_language', err);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
}});

async function currencyConverter() {
  const balance1 = await Convert(1).from('EUR').to('USD');
  const balance2 = await Convert(1).from('EUR').to('RUB');

  const exchangeRates = {
    '€': 1,
    '$': balance1,
    '₽': balance2,
  };
  
  return exchangeRates;
}

/////////////////////

app.listen(PORT, (err) => {
  if (err) {
    return console.log(err);
  }
  console.log('server SHOP has been started');
});

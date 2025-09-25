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
import AdminsListModel from './models/adminsList.js';
import AdminPasswordModel from './models/adminPassword.js';
import PromocodesModel from './models/promocodes.js';
import PromocodesPersonalModel from './models/promocodesPersonal.js';
import CashbackBallModel from './models/cashbackball.js';
import ReferalsModel from './models/referals.js';
import ReferalsPromoForQuantityModel from './models/referals_promoForQuantity.js';
import ReferalsPromoForPurchaseModel from './models/referals_promoForPurchase.js';


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

          // Отправляем сообщение всем админам о новом оплаченном заказе
          try {
            const notificationMessage = `New order paid!\n\nOrder ID: ${updatedOrder._id}\nTotal items: ${updatedOrder.goods?.length || 0}`;
            const notificationResult = await sendTlgMessageToAdmins(notificationMessage);
            console.log('Результат отправки уведомлений админам:', notificationResult);
          } catch (notificationError) {
            console.error('Ошибка при отправке уведомления админам:', notificationError);
          }


          if (updatedOrder) {
            console.log(
              `Order ${updatedOrder._id} payment status updated to true`
            );



            console.log('updatedOrder=',updatedOrder)

            const jbid = updatedOrder.jbid 

            console.log('jbid=',jbid)


            // отправить запрос в JB для создания тегов для дожима и рассылок
            const jbtoken = process.env.JB_TOKEN
            const jburlSetTag = process.env.JB_URL_SET_TAG
            const jburlDelTag = process.env.JB_URL_DEL_TAG
            const jburlUpdateVar = process.env.JB_URL_UPDATE_VAR

            const bodySetTag = {
              api_token: jbtoken,
              contact_id: jbid,
              name: "purchaseDone",
            }
            
            const bodyDelTag = {
              api_token: jbtoken,
              contact_id: jbid,
              name: "startPayingButNotPayed",
            }
            
            
            const bodyUpdateVar = {
              api_token: jbtoken,
              contact_id: jbid,
              name: "context",
              value: "waitingForDelivery"
            }
            
            const bodyUpdateVar2 = {
              api_token: jbtoken,
              contact_id: jbid,
              name: "crmStatus",
              value: "4"
            }


            const safeRequest = async (url, body, headers) => {      
            try {
              return await axios.post(url, body, { headers });     
            } catch (error) {
              console.error('Request failed:', error.message);     
              return null;
            }
          };


          //добавлена задержка между запросами, чтоб JB успел переварить 5 одновременных запросов

          const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

          const response1 = await safeRequest(jburlSetTag, bodySetTag, {
            'Content-Type': 'application/json' });
          await delay(500);

          const response2 = await safeRequest(jburlDelTag, bodyDelTag, {
            'Content-Type': 'application/json' });
          await delay(500);


          const response3 = await safeRequest(jburlUpdateVar, bodyUpdateVar, {
            'Content-Type': 'application/json' });
          await delay(500);

          const response4 = await safeRequest(jburlUpdateVar, bodyUpdateVar2, {
            'Content-Type': 'application/json' });

          console.log('отправить обновления в JB 7')
          console.log('response 1', response1.status , response1.statusText)
          console.log('response 2', response2.status , response2.statusText)
          console.log('response 3', response3.status , response3.statusText)
          console.log('response 4', response4.status , response4.statusText)
          
          await UserModel.findOneAndUpdate(
            { tlgid: updatedOrder.tlgid },
            {
              crmStatus: 4,
              isWaitingAdminAction: true
            },
            { new: true }
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

            // добавляем баллы кешбека пользователю
            if (updatedOrder.typeLoyaltySystem == 'addCashback') {

              const cashbackValute = updatedOrder.cashbackValute
              const shouldBeCashbacked = updatedOrder.shouldBeCashbacked

              console.log('добавление кешбека: ')
              console.log('баллы:',shouldBeCashbacked, ' валюта юзера:',cashbackValute )

              const exchangeRates = await currencyConverter();
              // const convertedCashback = Number((shouldBeCashbacked / exchangeRates[cashbackValute]).toFixed(2))
              const convertedCashback = Math.round((shouldBeCashbacked / exchangeRates[cashbackValute]) * 100) / 100

              console.log('конвертированные баллы:',convertedCashback, ' евро:' )
              
              const updatedUser = await UserModel.findOneAndUpdate(
            { tlgid: updatedOrder.tlgid }, // условие поиска
            {
              $inc: { cashbackBall: convertedCashback },
                          
            },
            { new: true } 
          );

            updatedOrder.isCashbackOperationDone = 'cashback-added' 
            await updatedOrder.save();

            }


            
            // списываем кешбек, если пользователь применил списание
            if (updatedOrder.typeLoyaltySystem == 'writeOffCashback') {

              // const cashbackValute = updatedOrder.cashbackValute
              // const shouldBeCashbacked = updatedOrder.shouldBeCashbacked

              console.log('списание всего кешбека')
              // console.log('баллы:',shouldBeCashbacked, ' валюта юзера:',cashbackValute )

              // const exchangeRates = await currencyConverter();
              // // const convertedCashback = Number((shouldBeCashbacked / exchangeRates[cashbackValute]).toFixed(2))
              // const convertedCashback = Math.round((shouldBeCashbacked / exchangeRates[cashbackValute]) * 100) / 100

              // console.log('конвертированные баллы:',convertedCashback, ' евро:' )
              
              const updatedUser = await UserModel.findOneAndUpdate(
            { tlgid: updatedOrder.tlgid }, // условие поиска
            {
               cashbackBall: 0 
            },
            { new: true } 
          );

            updatedOrder.isCashbackOperationDone = 'cashback-writtenOff' 
            await updatedOrder.save();

            }


            //  начисляем кешбек рефереру, если покупка была совершена его рефералом
             const findReferer = await ReferalsModel.findOne(
            { son: updatedOrder.tlgid }, // условие поиска
          );
            
          if (findReferer) {
            const referer = findReferer.father
            console.log('user have referer - начисляем', referer)

            // найти в БД referals_promoForPurchase параметр sale и сохранить в const saleValue
            const promoForPurchase = await ReferalsPromoForPurchaseModel.findOne();
            const saleValue = promoForPurchase ? promoForPurchase.sale : 0;

            if (saleValue > 0) {
              // посчитать количество баллов (сохранить в const ballToAdd) - это сумма всех товаров в корзине в евро * saleValue
              let totalSumInEuro = 0;
              if (updatedOrder.goods && Array.isArray(updatedOrder.goods)) {
                for (const item of updatedOrder.goods) {
                  if (item.actualPurchasePriceInEu && item.qty) {
                    totalSumInEuro += item.actualPurchasePriceInEu * item.qty;
                  }
                }
              }

              const ballToAdd = totalSumInEuro * (saleValue/100);
              console.log(`Начисляем рефереру ${referer}: ${ballToAdd} баллов (сумма заказа: ${totalSumInEuro} EUR, процент: ${saleValue})`);

              // найти в БД users пользователя с tlgid = referer и в поле cashbackBall прибавить значение из ballToAdd
              const updatedReferer = await UserModel.findOneAndUpdate(
                { tlgid: referer },
                { $inc: { cashbackBall: ballToAdd } },
                { new: true }
              );

              if (updatedReferer) {
                console.log(`Успешно начислено ${ballToAdd} баллов рефереру ${referer}. Новый баланс: ${updatedReferer.cashbackBall}`);
              } else {
                console.log(`Не удалось найти реферера с tlgid: ${referer}`);
              }
            } else {
              console.log('Процент для начисления реферального кешбека не установлен или равен 0');
            }

          } else {
            console.log('user have NO referer - не начисляем кешбек рефереру')
          }





            // Отмечаем промокод как использованный, если он был применен
            if (updatedOrder.goods && Array.isArray(updatedOrder.goods)) {
              for (const item of updatedOrder.goods) {
                try {
                  // Проверяем, был ли использован промокод для этого товара
                  if (item.isPurchasedByPromocode === true && item.promocode && item.promocodeType) {
                    if (item.promocodeType === 'personal') {
                      // Для персональных промокодов - отмечаем как использованный и деактивируем
                      await PromocodesPersonalModel.findOneAndUpdate(
                        { code: item.promocode },
                        { 
                          isUsed: true,
                          isActive: false
                        }
                      );
                      console.log(`Personal promocode ${item.promocode} marked as used`);
                    } else if (item.promocodeType === 'general') {
                      // Для общих промокодов - добавляем пользователя в массив tlgid
                      const user = await UserModel.findOne({ tlgid: updatedOrder.tlgid });
                      if (user) {
                        await PromocodesModel.findOneAndUpdate(
                          { code: item.promocode },
                          { $addToSet: { tlgid: user._id } }
                        );
                        console.log(`User ${updatedOrder.tlgid} added to general promocode ${item.promocode} usage list`);
                      }
                    }
                    // Прерываем цикл после первого найденного промокода
                    break;
                  }
                } catch (promocodeError) {
                  console.error(`Error updating promocode for item ${item.itemId}:`, promocodeError);
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
      await createNewUser(req.body.tlgid, req.body.jbid, req.body.language);
      const userData = { result: 'showOnboarding', language:req.body.language  };

      // если юзер чей-то реферал, то пометить, в БД рефералов, что вошел в Аппку 
      const resp = await ReferalsModel.findOneAndUpdate(
        { son: req.body.tlgid,
          isSonEnterToApp: false
         },
        { isSonEnterToApp: true },
        { new: true }
      );

      if (resp) {

      const referer = resp.father

      const qtyOfReferals = await ReferalsModel.countDocuments({
        father: referer,
        isSonEnterToApp: true
      });

      const promoRecord = await ReferalsPromoForQuantityModel.findOne({
        qty: qtyOfReferals
      });

      const saleForGeneratePromo = promoRecord ? promoRecord.sale : null;

      if (saleForGeneratePromo != null){
        // запуск функции генерации личного промокода
        console.log('запуск функции генерации личного промокода с %', saleForGeneratePromo)
        const creatingPromo = await createPersonalPromoForReferals(referer, saleForGeneratePromo,qtyOfReferals)
        console.log('creatingPromo', creatingPromo)
      }
    }


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

async function createNewUser(tlgid, jbid, lang) {
  try {
    const doc = new UserModel({
      tlgid: tlgid,
      jbid: jbid,
      valute: '€',
      language: lang,
    });

    await doc.save();

    // отправить запрос в JB для создания тегов для дожима и рассылок
    const jbtoken = process.env.JB_TOKEN
    const jburlSetTag = process.env.JB_URL_SET_TAG
    const jburlDelTag = process.env.JB_URL_DEL_TAG
    const jburlUpdateVar = process.env.JB_URL_UPDATE_VAR

    const bodySetTag = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "notAddGoodAtCart",
    }
    
    const bodyDelTag = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "openBot",
    }
    
    const bodyDelTag2 = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "crmStatus0",
    }
    
    const bodyUpdateVar = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "context",
      value: "series2_message1"
    }
    
    const bodyUpdateVar2 = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "crmStatus",
      value: "1"
    }


    const safeRequest = async (url, body, headers) => {      
    try {
      return await axios.post(url, body, { headers });     
    } catch (error) {
      console.error('Request failed:', error.message);     
      return null;
    }
  };


  //добавлена задержка между запросами, чтоб JB успел переварить 5 одновременных запросов

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const response1 = await safeRequest(jburlSetTag, bodySetTag, {
    'Content-Type': 'application/json' });
  await delay(500);

  const response2 = await safeRequest(jburlDelTag, bodyDelTag, {
    'Content-Type': 'application/json' });
  await delay(500);

  const response3 = await safeRequest(jburlDelTag, bodyDelTag2, {
    'Content-Type': 'application/json' });
  await delay(500);

  const response4 = await safeRequest(jburlUpdateVar, bodyUpdateVar, {
    'Content-Type': 'application/json' });
  await delay(500);

  const response5 = await safeRequest(jburlUpdateVar, bodyUpdateVar2, {
    'Content-Type': 'application/json' });

  console.log('в JB: добавить тег notAddGoodAtCart, удалить тег openBot(если он есть) и crmStatus0(если он есть), переменная context=series2_message1 и переменная crmStatus=1')
  console.log('response 1', response1.status , response1.statusText)
  console.log('response 2', response2.status , response2.statusText)
  console.log('response 3', response3.status , response3.statusText)
  console.log('response 4', response4.status , response4.statusText)
  console.log('response 5', response5.status , response5.statusText)



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

// Получить все промокоды - admin
app.get('/api/admin_get_promocodes', async (req, res) => {
  try {
    const { isActive } = req.query;
    let filter = {};
    
    if (isActive === 'true') {
      filter.isActive = true;
    } else if (isActive === 'false') {
      filter.isActive = false;
    } else {
      // По умолчанию возвращаем только активные промокоды для обратной совместимости
      filter.isActive = true;
    }
    
    const promocodes = await PromocodesModel.find(filter).sort({ createdAt: -1 });
    console.log('[Database] Promocodes fetched:', promocodes.length, 'with filter:', filter);
    res.json(promocodes);
  } catch (error) {
    console.error('[Error] Failed to fetch promocodes:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// получить список персональных промокодов
app.get('/api/admin_get_personal_promocodes', async (req, res) => {
  try {
    const { isActive } = req.query;
    let filter = {};
    
    if (isActive === 'true') {
      filter.isActive = true;
    } else if (isActive === 'false') {
      filter.isActive = false;
    } else {
      // По умолчанию возвращаем только активные промокоды для обратной совместимости
      filter.isActive = true;
    }
    
    const personalPromocodes = await PromocodesPersonalModel.find(filter)
      .populate('tlgid', 'tlgid name')
      .sort({ createdAt: -1 });
    console.log('[Database] Personal promocodes fetched:', personalPromocodes.length, 'with filter:', filter);
    res.json(personalPromocodes);
  } catch (error) {
    console.error('[Error] Failed to fetch personal promocodes:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// получить персональные промокоды для конкретного пользователя по ObjectId
app.get('/api/admin_get_personal_promocodes/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('[API] Fetching personal promocodes for user ObjectId:', userId);

    const personalPromocodes = await PromocodesPersonalModel.find({
      tlgid: userId,  // В базе поле называется tlgid, но хранит ObjectId пользователя
      isActive: true
    }).sort({ createdAt: -1 });

    console.log('[Database] Personal promocodes found for userId', userId, ':', personalPromocodes.length);

    res.json({
      status: 'ok',
      promocodes: personalPromocodes,
      total: personalPromocodes.length
    });
  } catch (error) {
    console.error('[Error] Failed to fetch personal promocodes for user:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// отправить персональный промокод пользователю через бота
app.post('/api/send_personalpromo_tojb', async (req, res) => {
  try {
    const { promocodeId, userId, userTlgid } = req.body;

    console.log('[API] Sending personal promocode to user:', {
      promocodeId,
      userId,
      userTlgid
    });

    // Получаем информацию о промокоде
    const promocode = await PromocodesPersonalModel.findById(promocodeId);
    if (!promocode) {
      return res.status(404).json({
        error: 'Promocode not found',
        status: 'error'
      });
    }

    // Получаем информацию о пользователе
    // const user = await UserModel.findById(userId);
    const user = await UserModel.findOneAndUpdate(
      { tlgid: userTlgid },
      { isWaitingAdminAction: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        status: 'error'
      });
    }
    
    const language = user.language

    const text = {
      title : {
        de : '🎉 Ihr persönlicher Promo-Code!',
        en: '🎉 Your personal promocode! ',
        ru: '🎉 Ваш персональный промокод!'
      },
      code: {
        de: 'Code: ',
        en: 'Code: ',
        ru: 'Код: '
      },
      sale: {
        de: 'Rabatt: ',
        en: 'Doscount: ',
        ru: 'Скидка: ',
      },
      valid: {
        de: 'Gültig bis: ',
        en: 'Valid until: ',
        ru: 'Действует до: '
      },
      open: {
        de: 'öffnen',
        en: 'open',
        ru: 'открыть'
      }
    }

    const formattedDate = new Date(promocode.expiryDate).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })

    const btnText = text.open[language]

    // Формируем сообщение для отправки в Telegram
    const message = `${text.title[language]}\n\n${text.code[language]} <code>${promocode.code}</code>\n${text.sale[language]} -${promocode.saleInPercent}%\n${text.valid[language]} ${formattedDate}`;

    // Отправляем сообщение через Telegram Bot API
    const telegramResponse = await axios.post(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      {
        chat_id: userTlgid,
        text: message,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: btnText,
                web_app: {
                  url: process.env.FRONTEND_URL
                }
              }
            ]
          ]
        }
      }
    );

    console.log('[Telegram] Message sent successfully:', telegramResponse.data);

    res.json({
      status: 'ok',
      message: 'Promocode sent successfully',
      telegramResponse: telegramResponse.data
    });

  } catch (error) {
    console.error('[Error] Failed to send personal promocode:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
      status: 'error'
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

// проверить, используется ли тег пользователями
app.post('/api/admin_check_tag_usage', async (req, res) => {
  try {
    const { tagId } = req.body;
    
    if (!tagId) {
      return res.status(400).json({
        error: 'Tag ID is required',
      });
    }

    console.log('[Database] Checking tag usage for ID:', tagId);
    
    // Ищем пользователей с этим тегом
    const usersWithTag = await UserModel.find({ tags: tagId });
    
    res.json({
      status: 'ok',
      isUsed: usersWithTag.length > 0,
      usersCount: usersWithTag.length
    });
  } catch (error) {
    console.error('[Error] Failed to check tag usage:', error);
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

// ============= CASHBACK BALL ENDPOINTS =============

// Получить все настройки cashback
app.get('/api/admin_get_cashbackball', async (req, res) => {
  try {
    const cashbackSettings = await CashbackBallModel.find().sort({ position: 1 });
    console.log('[Database] CashbackBall settings fetched:', cashbackSettings.length);
    res.json(cashbackSettings);
  } catch (error) {
    console.error('[Error] Failed to fetch cashbackball settings:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// Добавить новую настройку cashback
app.post('/api/admin_add_cashbackball', async (req, res) => {
  try {
    const { sum, percent, name } = req.body;
    
    if (sum === undefined || sum === null || isNaN(sum) || sum < 0) {
      return res.status(400).json({
        error: 'Sum is required and must be a positive number or zero',
      });
    }

    if (!percent || isNaN(percent) || percent <= 0 || percent > 100) {
      return res.status(400).json({
        error: 'Percent is required and must be between 1 and 100',
      });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({
        error: 'Name is required',
      });
    }

    // Получаем максимальную позицию и добавляем 1
    const maxPositionDoc = await CashbackBallModel.findOne().sort({ position: -1 });
    const nextPosition = maxPositionDoc ? maxPositionDoc.position + 1 : 1;

    const newCashbackSetting = new CashbackBallModel({
      sum: parseFloat(sum),
      percent: parseFloat(percent),
      name: name.trim(),
      position: nextPosition
    });

    const savedSetting = await newCashbackSetting.save();
    
    console.log('[Database] CashbackBall setting created:', savedSetting._id);
    
    res.json({
      status: 'ok',
      cashbackSetting: savedSetting,
    });
  } catch (error) {
    console.error('[Error] Failed to create cashbackball setting:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// Обновить настройку cashback
app.post('/api/admin_update_cashbackball', async (req, res) => {
  try {
    const { id, sum, percent } = req.body;
    
    if (!id) {
      return res.status(400).json({
        error: 'ID is required',
      });
    }

    console.log('SUM', sum)

    if (sum === undefined || sum === null || isNaN(sum) || sum < 0) {
      return res.status(400).json({
        error: 'Sum is required and must be a positive number or zero',
      });
    }

    if (!percent || isNaN(percent) || percent < 0 || percent > 100) {
      return res.status(400).json({
        error: 'Percent is required and must be between 1 and 100',
      });
    }

   

    const updatedSetting = await CashbackBallModel.findByIdAndUpdate(
      id,
      {
        sum: parseFloat(sum),
        percent: parseFloat(percent),
      },
      { new: true }
    );

    if (!updatedSetting) {
      return res.status(404).json({
        error: 'CashbackBall setting not found',
      });
    }

    console.log('[Database] CashbackBall setting updated:', updatedSetting._id);
    
    res.json({
      status: 'ok',
      cashbackSetting: updatedSetting,
    });
  } catch (error) {
    console.error('[Error] Failed to update cashbackball setting:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// Удалить настройку cashback
app.post('/api/admin_delete_cashbackball', async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({
        error: 'ID is required',
      });
    }

    const deletedSetting = await CashbackBallModel.findByIdAndDelete(id);

    if (!deletedSetting) {
      return res.status(404).json({
        error: 'CashbackBall setting not found',
      });
    }

    console.log('[Database] CashbackBall setting deleted:', deletedSetting._id);
    
    res.json({
      status: 'ok',
      deletedSetting: deletedSetting,
    });
  } catch (error) {
    console.error('[Error] Failed to delete cashbackball setting:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// Получить уровни кэшбека для пользователей
app.get('/api/get_cashbackball_levels', async (req, res) => {
  try {
    const cashbackLevels = await CashbackBallModel.find().sort({ position: 1 });
    console.log('[Database] CashbackBall levels fetched for users:', cashbackLevels.length);
    res.json(cashbackLevels);
  } catch (error) {
    console.error('[Error] Failed to fetch cashbackball levels for users:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// Получить заказы пользователя с определенным статусом оплаты
app.get('/api/user_get_orders', async (req, res) => {
  try {
    const { tlgid, payStatus } = req.query;

    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'tlgid is required'
      });
    }
    
    const exchangeRates = await currencyConverter();

    console.log('exchangeRates',exchangeRates)

    const user = await UserModel.findOne({ tlgid });
    const valute = user?.valute || 'eur';
    const cashbackBall_inEu = user?.cashbackBall

    const cashbackBall = (Number(cashbackBall_inEu) * Number(exchangeRates[valute])).toFixed(2)

    // Получаем заказы с оплатой
    const orders = await OrdersModel.find({ tlgid, payStatus: true })
      .populate('goods.itemId')
      .lean();

    const purchaseQty = orders.length;

    // Считаем общую сумму покупок из поля actualPurchasePriceInEu
    let totalSumInEur = 0;
    orders.forEach((order) => {
      if (order.goods && Array.isArray(order.goods)) {
        order.goods.forEach((good) => {
          if (good.actualPurchasePriceInEu) {
            totalSumInEur += parseFloat(good.actualPurchasePriceInEu);
          }
        });
      }
    });

    // Конвертируем в валюту клиента
    const totalSumInUserCurrency = totalSumInEur * exchangeRates[valute];

    // Получаем уровни кешбека
    const cashbackLevels = await CashbackBallModel.find().lean();
    
    // Сортируем уровни по sum (по возрастанию)
    const sortedLevels = cashbackLevels.sort((a, b) => a.sum - b.sum);
    
    // Создаем массив уровней в валюте клиента
    const sortedLevelsUserCurrency = sortedLevels.map(level => ({
      ...level,
      sum: parseFloat((level.sum * exchangeRates[valute]).toFixed(2))
    }));

    // Определяем текущий уровень кешбека клиента
    let currentLevel = '';
    let currentPercent = 0;
    let nextLevelSum = 0;
    let deltaToNextLevel = 0;

    for (let i = 0; i < sortedLevels.length; i++) {
      if (totalSumInEur >= sortedLevels[i].sum) {
        currentLevel = sortedLevels[i].position || sortedLevels[i].name;
        currentPercent = sortedLevels[i].percent
      } else {
        // Нашли следующий уровень
        nextLevelSum = sortedLevels[i].sum;
        break;
      }
    }

    // Если не достиг ни одного уровня
    if (!currentLevel && sortedLevels.length > 0) {
      currentLevel = 'No level';
      currentPercent = 0;
      nextLevelSum = sortedLevels[0].sum;
    }

    // Считаем сколько осталось до следующего уровня
    if (nextLevelSum > 0) {
      deltaToNextLevel = nextLevelSum - totalSumInEur;
    } else {
      deltaToNextLevel = 0; // Достиг максимального уровня
    }

    // Конвертируем deltaToNextLevel в валюту пользователя
    const deltaToNextLevelInUserCurrency = deltaToNextLevel * exchangeRates[valute];

    console.log(`[Database] Orders fetched for user ${tlgid}: ${purchaseQty} orders, total sum: ${totalSumInEur} EUR (${totalSumInUserCurrency.toFixed(2)} ${valute}), level: ${currentLevel}, next level in: ${deltaToNextLevel} EUR`);
    
    res.json({
      cashbackBall,
      purchaseQty,
      totalSumInEur,
      totalSumInUserCurrency: parseFloat(totalSumInUserCurrency.toFixed(2)),
      valute,
      currentPercent,
      currentCashbackLevel: currentLevel,
      deltaToNextLevelInUserCurrency: parseFloat(deltaToNextLevelInUserCurrency.toFixed(2)),
      sortedLevelsUserCurrency: sortedLevelsUserCurrency
    });
  } catch (error) {
    console.error('[Error] Failed to fetch user orders:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// ============= END CASHBACK BALL ENDPOINTS =============

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
      // const user = await UserModel.findOne({ tlgid: userid });
      const user = await UserModel.findOneAndUpdate(
        { tlgid: userid },
        { crmStatus: 2},
        { new: true}
      
      );
      const jbid = user.jbid;

      if (action === 'plus') {
        // Создаем новую корзину только для действия "plus"
        const newCart = new CartsModel({
          tlgid: userid,
          goods: goodsarray,
          jbid: jbid,
        });
        await newCart.save();


        // отправить запрос в JB для создания тегов для дожима и рассылок
        // 1) добавить тег addGoodToCartNotStartPaying
        // 2) удалить теги notAddGoodAtCart, crmStatus0
        // 3) изменить переменные: context = series3_message1 , crmStatus= 2
        // 4) добавить переменную timeItemsAddedToCart - это время в unix, когда создалась корзина
        // 5) добавить переменную messageNumber - номер дожимаещего сообщения

        const jbtoken = process.env.JB_TOKEN
        const jburlSetTag = process.env.JB_URL_SET_TAG
        const jburlDelTag = process.env.JB_URL_DEL_TAG
        const jburlUpdateVar = process.env.JB_URL_UPDATE_VAR

        // utc time
        const timeItemsAddedToCart = Math.floor(Date.now() / 1000);

        const bodySetTag = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "addGoodToCartNotStartPaying",
        }
        
        const bodyDelTag = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "notAddGoodAtCart",
        }
        
        const bodyDelTag2 = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "crmStatus0",
        }
        
        const bodyUpdateVar = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "context",
          value: "series3_message1"
        }
        
        const bodyUpdateVar2 = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "crmStatus",
          value: "2"
        }
        
        const bodyUpdateVar3 = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "timeItemsAddedToCart",
          value: `${timeItemsAddedToCart}`
        }
        

        const safeRequest = async (url, body, headers) => {      
        try {
          return await axios.post(url, body, { headers });     
        } catch (error) {
          console.error('Request failed:', error.message);     
          return null;
        }
      };

      //добавлена задержка между запросами, чтоб JB успел переварить 5 одновременных запросов
      // м.б. далее снизить до 500мс iso 1000мс

      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      const response1 = await safeRequest(jburlSetTag, bodySetTag, {
      'Content-Type': 'application/json' });
      await delay(500);

      const response2 = await safeRequest(jburlDelTag, bodyDelTag, {
      'Content-Type': 'application/json' });
      await delay(500);

      const response3 = await safeRequest(jburlDelTag, bodyDelTag2, {
      'Content-Type': 'application/json' });
      await delay(500);

      const response4 = await safeRequest(jburlUpdateVar, bodyUpdateVar, {
      'Content-Type': 'application/json' });
      await delay(500);

      const response5 = await safeRequest(jburlUpdateVar, bodyUpdateVar2, {
      'Content-Type': 'application/json' });
      await delay(500);

      const response6 = await safeRequest(jburlUpdateVar, bodyUpdateVar3, {
      'Content-Type': 'application/json' });

      console.log('отправка изменений в JB')
      console.log('response 1', response1.status , response1.statusText)
      console.log('response 2', response2.status , response2.statusText)
      console.log('response 3', response3.status , response3.statusText)
      console.log('response 4', response4.status , response4.statusText)
      console.log('response 5', response5.status , response5.statusText)
      console.log('response 6', response6.status , response6.statusText)



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
      const foundCart = await CartsModel.findOne({ tlgid: userid });
      const jbid = foundCart.jbid

      await CartsModel.deleteOne({ tlgid: userid });


      await UserModel.findOneAndUpdate(
        { tlgid: userid },
        { crmStatus: 1  }
      );


        // возвращаем JB в пред состояние
        // 1)  добавить тег notAddGoodAtCart
        // 2)  удалить теги crmStatus0, addGoodToCartNotStartPaying
        // 3)  изменить переменные: context = series2_message1 , crmStatus= 1

        const jbtoken = process.env.JB_TOKEN
        const jburlSetTag = process.env.JB_URL_SET_TAG
        const jburlDelTag = process.env.JB_URL_DEL_TAG
        const jburlUpdateVar = process.env.JB_URL_UPDATE_VAR

        const bodySetTag = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "notAddGoodAtCart",
        }
        
        const bodyDelTag = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "addGoodToCartNotStartPaying",
        }
        
        const bodyDelTag2 = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "crmStatus0",
        }
        
        const bodyUpdateVar = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "context",
          value: "series2_message1"
        }
        
        const bodyUpdateVar2 = {
          api_token: jbtoken,
          contact_id: jbid,
          name: "crmStatus",
          value: "1"
        }


        const safeRequest = async (url, body, headers) => {      
        try {
          return await axios.post(url, body, { headers });     
        } catch (error) {
          console.error('Request failed:', error.message);     
          return null;
        }
      };

      const [response1, response2, response3, response4, response5] = await
      Promise.all([
        safeRequest(jburlSetTag, bodySetTag, {
      'Content-Type': 'application/json' }),
        safeRequest(jburlDelTag, bodyDelTag, {
      'Content-Type': 'application/json' }),
        safeRequest(jburlDelTag, bodyDelTag2, {
      'Content-Type': 'application/json' }),
        safeRequest(jburlUpdateVar, bodyUpdateVar, {
      'Content-Type': 'application/json' }),
        safeRequest(jburlUpdateVar, bodyUpdateVar2, {
      'Content-Type': 'application/json' })
      ]);

      console.log('отправка изменений в JB')
      console.log('response 1', response1.status , response1.statusText)
      console.log('response 2', response2.status , response2.statusText)
      console.log('response 3', response3.status , response3.statusText)
      console.log('response 4', response4.status , response4.statusText)
      console.log('response 5', response5.status , response5.statusText)



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
    const updatedUser = await UserModel.findOneAndUpdate(
      { tlgid: req.body.tlgid },
      { $set: { language: req.body.language } },
      { new: true }
    );

    // console.log('updatedUser', updatedUser)

    const jbid = updatedUser.jbid
    const jburl = process.env.JB_URL_UPDATE_VAR
    const jbtoken = process.env.JB_TOKEN

    const bodyForRqst = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "language",
      value: req.body.language
    }

    
    const response = await axios.post(jburl, bodyForRqst, 
     { headers: {
      'Content-Type': 'application/json',
    }}
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

// удалить страну для доставки
app.post('/api/admin_delete_country', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Country ID is required' 
      });
    }

    const result = await CountriesForDeliveryModel.findByIdAndDelete(id);

    if (!result) {
      console.warn(`Country with id ${id} not found`);
      return res.status(404).json({ 
        status: 'error', 
        message: 'Country not found' 
      });
    }

    res.status(200).json({ 
      status: 'ok', 
      message: 'Country deleted successfully',
      data: result 
    });
  } catch (error) {
    console.error('[Error] Deleting country:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while deleting country',
    });
  }
});

// создать новый промокод
app.post('/api/admin_add_new_promocode', async (req, res) => {
  try {
    const {
      description_admin,
      description_users_de,
      description_users_en,
      description_users_ru,
      code,
      sale,
      expiryDate,
      forFirstPurchase
    } = req.body;

    // Проверяем, что все обязательные поля заполнены
    if (!description_admin || !description_users_de || !description_users_en || 
        !description_users_ru || !code || sale === undefined || sale === null || !expiryDate) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    // Проверяем, что промокод уникальный
    const existingPromocode = await PromocodesModel.findOne({ code: code });
    if (existingPromocode) {
      return res.status(400).json({
        status: 'error',
        message: 'Promocode already exists'
      });
    }

    const document = new PromocodesModel({
      description_admin: description_admin,
      description_users_de: description_users_de,
      description_users_en: description_users_en,
      description_users_ru: description_users_ru,
      code: code,
      saleInPercent: Number(sale),
      type: 'general', // По умолчанию general
      expiryDate: new Date(expiryDate),
      isActive: true,
      forFirstPurshase: forFirstPurchase || false
    });

    await document.save();

    res.status(201).json({ 
      status: 'ok',
      message: 'Promocode created successfully',
      data: document
    });
  } catch (error) {
    console.error('[Error] Creating promocode:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while creating promocode',
      error: error.message
    });
  }
});

// найти пользователя по tlgid
app.post('/api/admin_find_user_by_tlgid', async (req, res) => {
  try {
    const { tlgid } = req.body;

    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'Telegram ID is required'
      });
    }

    // Ищем пользователя по tlgid
    const user = await UserModel.findOne({ tlgid: tlgid });
    
    if (user) {
      res.json({
        status: 'ok',
        found: true,
        user: {
          tlgid: user.tlgid,
          name: user.name || 'N/A'
        }
      });
    } else {
      res.json({
        status: 'ok',
        found: false,
        message: 'User with mentioned telegram id not found'
      });
    }
  } catch (error) {
    console.error('[Error] Finding user by tlgid:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while finding user',
      error: error.message
    });
  }
});

// создать новый персональный промокод
app.post('/api/admin_add_new_personal_promocode', async (req, res) => {
  try {
    const {
      description_admin,
      description_users_de,
      description_users_en,
      description_users_ru,
      code,
      sale,
      tlgid,
      expiryDate,
      forFirstPurchase
    } = req.body;

    // Проверяем, что все обязательные поля заполнены
    if (!description_admin || !description_users_de || !description_users_en || 
        !description_users_ru || !code || sale === undefined || sale === null || 
        !tlgid || !expiryDate) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    // Находим пользователя по tlgid чтобы получить его ObjectId
    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'User not found with provided telegram id'
      });
    }

    // Проверяем, что персональный промокод уникальный
    const existingPromocode = await PromocodesPersonalModel.findOne({ code: code });
    if (existingPromocode) {
      return res.status(400).json({
        status: 'error',
        message: 'Personal promocode already exists'
      });
    }

    // Также проверяем в обычных промокодах
    const existingGeneralPromocode = await PromocodesModel.findOne({ code: code });
    if (existingGeneralPromocode) {
      return res.status(400).json({
        status: 'error',
        message: 'Promocode already exists in general promocodes'
      });
    }

    const document = new PromocodesPersonalModel({
      tlgid: user._id,  // Сохраняем ObjectId пользователя, а не строку tlgid
      description_admin: description_admin,
      description_users_de: description_users_de,
      description_users_en: description_users_en,
      description_users_ru: description_users_ru,
      code: code,
      saleInPercent: Number(sale),
      type: 'personal', // Всегда personal
      expiryDate: new Date(expiryDate),
      isActive: true,
      isUsed: false,
      forFirstPurshase: forFirstPurchase || false
    });

    await document.save();

    res.status(201).json({ 
      status: 'ok',
      message: 'Personal promocode created successfully',
      data: document
    });
  } catch (error) {
    console.error('[Error] Creating personal promocode:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while creating personal promocode',
      error: error.message
    });
  }
});



// создать новый персональный промокод - за приглашение рефералов

async function createPersonalPromoForReferals(tlgidValue, saleValue,qtyOfReferals){

  try {
    
    
    const description_admin = `code generated by system for inviting ${qtyOfReferals} referals`
    const description_users_de = `promo-code für die einladung von empfehlungen - ${qtyOfReferals} pers.`
    const description_users_en = `promocode for inviting referals - ${qtyOfReferals} pers.`
    const description_users_ru = `промокод за приглашение рефералов - ${qtyOfReferals} чел.`
    // const code = '7771122'
    const tlgid = tlgidValue
    const today = new Date();
    const expiryDate = new Date(today.getTime() + (90 * 24 * 60 * 60 * 1000));
    
    // функция генерации промокода
    const generateRandomCode = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 7; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    const code = generateRandomCode(); 

    // Находим пользователя по tlgid чтобы получить его ObjectId
    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'User not found with provided telegram id'
      });
    }

    // Проверяем, что персональный промокод уникальный
    // const existingPromocode = await PromocodesPersonalModel.findOne({ code: code });
    // if (existingPromocode) {
    //   return res.status(400).json({
    //     status: 'error',
    //     message: 'Personal promocode already exists'
    //   });
    // }

    // Также проверяем в обычных промокодах
    // const existingGeneralPromocode = await PromocodesModel.findOne({ code: code });
    // if (existingGeneralPromocode) {
    //   return res.status(400).json({
    //     status: 'error',
    //     message: 'Promocode already exists in general promocodes'
    //   });
    // }

    const document = new PromocodesPersonalModel({
      tlgid: user._id,  // Сохраняем ObjectId пользователя, а не строку tlgid
      description_admin: description_admin,
      description_users_de: description_users_de,
      description_users_en: description_users_en,
      description_users_ru: description_users_ru,
      code: code,
      saleInPercent: Number(saleValue),
      type: 'personal', // Всегда personal
      expiryDate: new Date(expiryDate),
      isActive: true,
      isUsed: false,
      forFirstPurshase: false,
      generatedBy: 'system'
    });

    await document.save();

    return ({status: 'created'})

    
  } catch (error) {
    console.error('[Error] Creating personal promocode:', error);
    console.error('[Error] Stack:', error.stack);
    return ({status: 'error'})
   
  }
};



// обновить промокод
app.post('/api/admin_update_promocode', async (req, res) => {
  try {
    const {
      id,
      code,
      description_admin,
      description_users_de,
      description_users_en,
      description_users_ru,
      expiryDate,
      forFirstPurchase
    } = req.body;

    // Проверяем, что все обязательные поля заполнены
    if (!id || !code || !description_admin || !description_users_de || 
        !description_users_en || !description_users_ru || !expiryDate) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    // Проверяем, что промокод существует
    const existingPromocode = await PromocodesModel.findById(id);
    if (!existingPromocode) {
      return res.status(404).json({
        status: 'error',
        message: 'Promocode not found'
      });
    }

    // Если код изменился, проверяем уникальность
    if (existingPromocode.code !== code) {
      const codeExists = await PromocodesModel.findOne({ code: code, _id: { $ne: id } });
      if (codeExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Promocode with this code already exists'
        });
      }
    }

    // Обновляем промокод
    const updatedPromocode = await PromocodesModel.findByIdAndUpdate(
      id,
      {
        code: code,
        description_admin: description_admin,
        description_users_de: description_users_de,
        description_users_en: description_users_en,
        description_users_ru: description_users_ru,
        expiryDate: new Date(expiryDate),
        forFirstPurshase: forFirstPurchase || false
      },
      { new: true }
    );

    res.json({
      status: 'ok',
      message: 'Promocode updated successfully',
      promocode: updatedPromocode
    });
  } catch (error) {
    console.error('[Error] Updating promocode:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while updating promocode',
      error: error.message
    });
  }
});

// деактивировать промокод (изменить isActive = false)
app.post('/api/admin_deactivate_promocode', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Promocode ID is required'
      });
    }

    // Проверяем, что промокод существует
    const existingPromocode = await PromocodesModel.findById(id);
    if (!existingPromocode) {
      return res.status(404).json({
        status: 'error',
        message: 'Promocode not found'
      });
    }

    // Деактивируем промокод
    const updatedPromocode = await PromocodesModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    res.json({
      status: 'ok',
      message: 'Promocode deactivated successfully',
      promocode: updatedPromocode
    });
    
    console.log('[Backend] Promocode deactivated:', updatedPromocode);
  } catch (error) {
    console.error('[Error] Deactivating promocode:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while deactivating promocode',
      error: error.message
    });
  }
});

// проверить промокод пользователем
app.post('/api/check_promocode', async (req, res) => {
  try {
    const { code: rawCode, userId } = req.body;

    if (!rawCode && !userId) {
      return res.status(400).json({
        status: 'error',
        message: 'Promocode and user is required'
      });
    }

    // нижний регистр
    const code = rawCode.trim().toLowerCase();
    
    const user = await UserModel.findOne({ tlgid: userId });
    const userValute = user.valute;
    const userLanguage = user.language

    const promocode = await PromocodesModel.findOne({ code: code });
    const promocodePersonal = await PromocodesPersonalModel.findOne({ code: code });
    
    const isNotValid = {
      de: 'der gutscheincode ist ungültig',
      en: 'promocode is not valid',
      ru: 'промокод не действителен'
    }

    const isNotActive = {
      de: 'der gutscheincode ist nicht aktiv',
      en: 'promocode is not active',
      ru: 'промокод не активен'
    }

    const isExpired = {
      de: 'der gutscheincode ist abgelaufen',
      en: 'promocode has expired',
      ru: 'срок действия истек'
    }

    const alreadyUsed = {
      de: 'sie haben diesen gutscheincode bereits verwendet',
      en: 'you have already used this promocode',
      ru: 'вы уже использовали этот промокод'
    }

    const firstPurchaseOnly = {
      de: 'dieser gutscheincode gilt nur für den ersten kauf',
      en: 'this promocode is only for first purchase',
      ru: 'этот промокод применим только к 1ой покупке'
    }

    const codeApplied = {
      de: 'promo-Code angewendet',
      en: 'promocode applied',
      ru: 'промокод применен'
     }

    
    if (!promocode && !promocodePersonal) {
      return res.status(404).json({
        status: 'error',
        // message: `Промокод ${code} не действителен`
        message: `${code} - ${isNotValid[userLanguage]}`
      });
    }


    const currentDate = new Date();
  
    if(promocode) {
    // Проверяем активность промокода
    if (!promocode.isActive ) {
      return res.status(400).json({
        status: 'error',
        message: isNotActive[userLanguage]
      });
    }

     // Проверяем срок действия
    const expiryDate = new Date(promocode.expiryDate);

     if (currentDate > expiryDate ) {
      return res.status(400).json({
        status: 'error',
        message: isExpired[userLanguage]
      });
    }
    
  
    // Если передан userId, проверяем не использовал ли уже пользователь этот промокод
      if (user && promocode.tlgid.includes(user._id)) {
        return res.status(400).json({
          status: 'error',
          message: alreadyUsed[userLanguage]
        });
      }

      // Для промокодов только для первой покупки - проверяем есть ли у пользователя заказы
      if (promocode.forFirstPurshase && user) {
        const userOrders = await OrdersModel.find({ tlgid: userId, payStatus: true });
        if (userOrders.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: firstPurchaseOnly[userLanguage]
          });
        } 
      }
    


    const cart = await CartsModel.findOne({ tlgid: userId }).lean();
    
    
    const exchangeRates = await currencyConverter();

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

          // если товар продается без скидки
          let price_eu_toReturn = (itemPrice* (1 - Number(promocode.saleInPercent) / 100)).toFixed(2)
          let priceToShow_toReturn = (Number(convertedPrice) * (1 - Number(promocode.saleInPercent) / 100)).toFixed(2)
          let isWithPromoSale_toReturn = true
          let totalpriceItemWithPromo_toReturn = ((Number(convertedPrice) * (1 - Number(promocode.saleInPercent) / 100))*itemQty).toFixed(2)
          let promocodeText_toReturn = code
          let promocodeType_toReturn = 'general'


          // если товар продается уже по скидке
          if (good.isSaleNow){
            price_eu_toReturn = itemPrice.toFixed(2)
            priceToShow_toReturn = convertedPrice
            isWithPromoSale_toReturn = false
            totalpriceItemWithPromo_toReturn = (convertedPrice * itemQty).toFixed(2)
            promocodeText_toReturn = 'no'
            promocodeType_toReturn = 'no'
          }


          return {
            name_en: good.name_en,
            name_de: good.name_de,
            name_ru: good.name_ru,
            price_eu: price_eu_toReturn,
            price_euNoPromoApplied: itemPrice,
            priceToShow: priceToShow_toReturn,
            priceToShowNoPromoApplied: convertedPrice,
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
            totalpriceItemWithPromo: totalpriceItemWithPromo_toReturn,
            valuteToShow: userValute,
            isSaleNow: good.isSaleNow,
            isWithPromoSale: isWithPromoSale_toReturn,
            promocodeText: promocodeText_toReturn, 
            promocodeType: promocodeType_toReturn
            
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
    const totalPriceWithPromo = filteredGoods.reduce(
      (sum, item) => sum + Number(item.totalpriceItemWithPromo),
      0
    );

    

    return res.json({
      status: 'ok',
      goods: filteredGoods,
      totalQty: totalQty,
      valuteToShow: userValute,
      totalPriceCart: parseFloat(totalPrice.toFixed(2)), // Округляем до 2 знаков после запятой
      totalPriceCartWithPromocode: parseFloat(totalPriceWithPromo.toFixed(2)),
      textForUser: codeApplied[userLanguage]
    });

    }

    if (promocodePersonal){


      // Проверка, что это код данного юзера
      if (!promocodePersonal.tlgid.equals(user._id)) {
        return res.status(400).json({
          status: 'error',
          message: `${code} - ${isNotValid[userLanguage]}`
        });
      }




      if (promocodePersonal.isUsed || !promocodePersonal.isActive ) {
     return res.status(400).json({
       status: 'error',
       message: isNotValid[userLanguage]
     });
   }

       // Проверяем срок действия
    const expiryDate = new Date(promocodePersonal.expiryDate);

     if (currentDate > expiryDate ) {
      return res.status(400).json({
        status: 'error',
        message: isExpired[userLanguage]
      });
    }
    

    // Для промокодов только для первой покупки - проверяем есть ли у пользователя заказы
      if (promocodePersonal.forFirstPurshase) {
        const userOrders = await OrdersModel.find({ tlgid: userId, payStatus: true });
        if (userOrders.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: firstPurchaseOnly[userLanguage]
          });
        } 
      }


    
    

    const cart = await CartsModel.findOne({ tlgid: userId }).lean();
    
    const exchangeRates = await currencyConverter();

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


           // если товар продается без скидки
          let price_eu_toReturn = (itemPrice* (1 - Number(promocodePersonal.saleInPercent) / 100)).toFixed(2)
          let priceToShow_toReturn = (Number(convertedPrice) * (1 - Number(promocodePersonal.saleInPercent) / 100)).toFixed(2)
          let isWithPromoSale_toReturn = true
          let totalpriceItemWithPromo_toReturn = ((Number(convertedPrice) * (1 - Number(promocodePersonal.saleInPercent) / 100))*itemQty).toFixed(2)
          let promocodeText_toReturn = code
          let promocodeType_toReturn = 'personal'

          // если товар продается уже по скидке
          if (good.isSaleNow){
            price_eu_toReturn = itemPrice.toFixed(2)
            priceToShow_toReturn = convertedPrice
            isWithPromoSale_toReturn = false
            totalpriceItemWithPromo_toReturn = (convertedPrice * itemQty).toFixed(2)
            promocodeText_toReturn = 'no'
            promocodeType_toReturn = 'no'
          }


          return {
            name_en: good.name_en,
            name_de: good.name_de,
            name_ru: good.name_ru,
            price_eu: price_eu_toReturn,
            price_euNoPromoApplied: itemPrice,
            priceToShow: priceToShow_toReturn,
            priceToShowNoPromoApplied: convertedPrice,
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
            totalpriceItemWithPromo: totalpriceItemWithPromo_toReturn,
            valuteToShow: userValute,
            isSaleNow: good.isSaleNow,
            isWithPromoSale: isWithPromoSale_toReturn,
            promocodeText: promocodeText_toReturn, 
            promocodeType: promocodeType_toReturn
            
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
    const totalPriceWithPromo = filteredGoods.reduce(
      (sum, item) => sum + Number(item.totalpriceItemWithPromo),
      0
    );

     console.log('применили')

     

    return res.json({
      status: 'ok',
      goods: filteredGoods,
      totalQty: totalQty,
      valuteToShow: userValute,
      totalPriceCart: parseFloat(totalPrice.toFixed(2)), // Округляем до 2 знаков после запятой
      totalPriceCartWithPromocode: parseFloat(totalPriceWithPromo.toFixed(2)),
      textForUser: codeApplied[userLanguage]
    });

    }

  } catch (error) {
    console.error('[Error] Checking promocode:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while checking promocode',
      error: error.message
    });
  }
});

// обновить персональный промокод
app.post('/api/admin_update_personal_promocode', async (req, res) => {
  try {
    const {
      id,
      code,
      description_admin,
      description_users_de,
      description_users_en,
      description_users_ru,
      expiryDate,
      forFirstPurchase
    } = req.body;

    // Проверяем, что все обязательные поля заполнены
    if (!id || !code || !description_admin || !description_users_de || 
        !description_users_en || !description_users_ru || !expiryDate) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    // Проверяем, что персональный промокод существует
    const existingPromocode = await PromocodesPersonalModel.findById(id);
    if (!existingPromocode) {
      return res.status(404).json({
        status: 'error',
        message: 'Personal promocode not found'
      });
    }

    // Если код изменился, проверяем уникальность
    if (existingPromocode.code !== code) {
      const codeExists = await PromocodesPersonalModel.findOne({ code: code, _id: { $ne: id } });
      if (codeExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Personal promocode with this code already exists'
        });
      }
    }

    // Обновляем персональный промокод
    const updatedPromocode = await PromocodesPersonalModel.findByIdAndUpdate(
      id,
      {
        code: code,
        description_admin: description_admin,
        description_users_de: description_users_de,
        description_users_en: description_users_en,
        description_users_ru: description_users_ru,
        expiryDate: new Date(expiryDate),
        forFirstPurshase: forFirstPurchase || false
      },
      { new: true }
    ).populate('tlgid', 'tlgid name');

    res.json({
      status: 'ok',
      message: 'Personal promocode updated successfully',
      promocode: updatedPromocode
    });
  } catch (error) {
    console.error('[Error] Updating personal promocode:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while updating personal promocode',
      error: error.message
    });
  }
});

// деактивировать персональный промокод
app.post('/api/admin_deactivate_personal_promocode', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Personal promocode ID is required'
      });
    }

    // Проверяем, что персональный промокод существует
    const existingPromocode = await PromocodesPersonalModel.findById(id);
    if (!existingPromocode) {
      return res.status(404).json({
        status: 'error',
        message: 'Personal promocode not found'
      });
    }

    // Деактивируем промокод
    const updatedPromocode = await PromocodesPersonalModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    res.json({
      status: 'ok',
      message: 'Personal promocode deactivated successfully',
      promocode: updatedPromocode
    });
    
    console.log('[Backend] Personal promocode deactivated:', updatedPromocode);
  } catch (error) {
    console.error('[Error] Deactivating personal promocode:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while deactivating personal promocode',
      error: error.message
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

// получить заказы за период - admin
app.get('/api/admin/orders', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = {
      payStatus: true  // Только оплаченные заказы
    };
    
    // Если переданы даты, фильтруем по периоду
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Находим заказы с детализацией товаров и статусов
    const orders = await OrdersModel.find(query)
      .populate('goods.itemId')
      .populate('orderStatus')
      .sort({ createdAt: -1 })
      .lean();

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
    const { cart, deliveryInfo, totalSum, region, tlgid,typeLoyaltySystem, shouldBeCashbacked,cashbackValute  } = req.body;


    if (!cart || !deliveryInfo || !totalSum || !tlgid || !typeLoyaltySystem || !shouldBeCashbacked, !cashbackValute) {
      return res.status(400).json({
        status: 'error',
        message: 'Cart, delivery info, total sum, tlgid and typeLoyaltySystem are required',
      });
    }


    // console.log('CAAART FOR CHECKING', cart)
    // return

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

    console.log('we are here 1')

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
    const user = await UserModel.findOneAndUpdate(
      { tlgid: Number(tlgid) },
      { crmStatus: 3 }, 
      { new: true }
    );
    
    console.log('we are here 2')
    
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

    console.log('we are here 3')

    // Создаем заказ с stripeSessionId, но payStatus=false до подтверждения
    const newOrder = new OrdersModel({
      tlgid: tlgid,
      jbid: jbid,
      goods: cart.map((item) => ({
        itemId: item.itemId,
        qty: item.qty,
        actualPurchasePriceInEu: item.price_eu,
        isPurchasedByCashback: item.isWithCashbackSale,
        isPurchasedBySale: item.isSaleNow,
        isPurchasedByPromocode: item.isWithPromoSale,
        promocode: item.promocodeText,
        promocodeType: item.promocodeType
      })),
      country: deliveryInfo.selectedCountry.name_en,
      regionDelivery: region,
      adress: deliveryInfo.address, // Note: keeping 'adress' spelling to match model
      phone: deliveryInfo.phone,
      name: deliveryInfo.userName,
      orderStatus: defaultStatus._id,
      payStatus: false, // Будет изменено на true через webhook
      stripeSessionId: session.id, // Сохраняем session ID для webhook
      typeLoyaltySystem: typeLoyaltySystem,
      shouldBeCashbacked: shouldBeCashbacked,
      cashbackValute:cashbackValute
      
    });

    console.log('we are here 4')

    // отправить данные в JB
    const jbtoken = process.env.JB_TOKEN
    const jburlSetTag = process.env.JB_URL_SET_TAG
    const jburlDelTag = process.env.JB_URL_DEL_TAG
    const jburlUpdateVar = process.env.JB_URL_UPDATE_VAR

    const bodySetTag = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "startPayingButNotPayed",
    }
    
    const bodyDelTag = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "addGoodToCartNotStartPaying",
    }
    
    
    const bodyUpdateVar = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "context",
      value: "series4_message1"
    }
    
    const bodyUpdateVar2 = {
      api_token: jbtoken,
      contact_id: jbid,
      name: "crmStatus",
      value: "3"
    }


    const safeRequest = async (url, body, headers) => {      
    try {
      return await axios.post(url, body, { headers });     
    } catch (error) {
      console.error('Request failed:', error.message);     
      return null;
    }
  };


  //добавлена задержка между запросами, чтоб JB успел переварить 5 одновременных запросов

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const response1 = await safeRequest(jburlSetTag, bodySetTag, {
    'Content-Type': 'application/json' });
  await delay(500);

  const response2 = await safeRequest(jburlDelTag, bodyDelTag, {
    'Content-Type': 'application/json' });
  await delay(500);


  const response3 = await safeRequest(jburlUpdateVar, bodyUpdateVar, {
    'Content-Type': 'application/json' });
  await delay(500);

  const response4 = await safeRequest(jburlUpdateVar, bodyUpdateVar2, {
    'Content-Type': 'application/json' });

  if (response1 && response1.status >= 200 && response1.status < 300 ) {
            console.log('response 1: данные в JB отправлены успешно');
  } else {
            console.error('response 1: ошибка отправки данных в JB');
  }

  if (response2 && response2.status >= 200 && response2.status < 300 ) {
            console.log('response 2: данные в JB отправлены успешно');
  } else {
            console.error('response 2: ошибка отправки данных в JB');
  }

  if (response3 && response3.status >= 200 && response3.status < 300 ) {
            console.log('response 3: данные в JB отправлены успешно');
  } else {
            console.error('response 3: ошибка отправки данных в JB');
  }

  if (response4 && response4.status >= 200 && response4.status < 300 ) {
            console.log('response 4: данные в JB отправлены успешно');
  } else {
            console.error('response 4: ошибка отправки данных в JB');
  }




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

// Получить cashback баллы пользователя
app.get('/api/user_get_cashback', async (req, res) => {
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
      cashbackBall: user.cashbackBall || 0,
    });
  } catch (error) {
    console.error('[Get User Cashback Error]:', error);
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


// получить список админов
app.get('/api/admin_get_admins', async (req, res) => {
  try {
    const admins = await AdminsListModel.find().sort({ createdAt: -1 });
    res.json(admins);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// сохранить нового админа
app.post('/api/admin_add_admin', async (req, res) => {
  try {
    const { tlgid, name } = req.body;
    
    // Проверка обязательных полей
    if (!tlgid || !name) {
      return res.status(400).json({
        status: 'error',
        error: 'tlgid and name are required'
      });
    }
    
    // Проверка на существование админа с таким tlgid
    const existingAdmin = await AdminsListModel.findOne({ tlgid });
    if (existingAdmin) {
      return res.status(400).json({
        status: 'error',
        error: 'Admin with this tlgid already exists'
      });
    }
    
    const admin = new AdminsListModel({
      tlgid: Number(tlgid),
      name: name.trim(),
    });

    await admin.save();
    
    res.json({
      status: 'ok',
      admin: admin
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      status: 'error',
      message: 'ошибка сервера',
    });
  }
});

// обновить админа
app.post('/api/admin_update_admin', async (req, res) => {
  try {
    const { id, tlgid, name } = req.body;
    
    // Проверка обязательных полей
    if (!id || !tlgid || !name) {
      return res.status(400).json({
        status: 'error',
        error: 'id, tlgid and name are required'
      });
    }
    
    // Проверка на существование другого админа с таким tlgid
    const existingAdmin = await AdminsListModel.findOne({ tlgid, _id: { $ne: id } });
    if (existingAdmin) {
      return res.status(400).json({
        status: 'error',
        error: 'Admin with this tlgid already exists'
      });
    }
    
    const updatedAdmin = await AdminsListModel.findByIdAndUpdate(
      id,
      {
        tlgid: Number(tlgid),
        name: name.trim(),
      },
      { new: true }
    );
    
    if (!updatedAdmin) {
      return res.status(404).json({
        status: 'error',
        error: 'Admin not found'
      });
    }
    
    res.json({
      status: 'ok',
      admin: updatedAdmin
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      status: 'error',
      message: 'ошибка сервера',
    });
  }
});

// удалить админа
app.post('/api/admin_delete_admin', async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({
        status: 'error',
        error: 'id is required'
      });
    }
    
    const deletedAdmin = await AdminsListModel.findByIdAndDelete(id);
    
    if (!deletedAdmin) {
      return res.status(404).json({
        status: 'error',
        error: 'Admin not found'
      });
    }
    
    res.json({
      status: 'ok',
      deletedAdmin: deletedAdmin
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      status: 'error',
      message: 'ошибка сервера',
    });
  }
});

// отправить сообщение всем админам (для тестирования)
app.post('/api/admin_send_message_to_all', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({
        status: 'error',
        error: 'message is required'
      });
    }
    
    const result = await sendTlgMessageToAdmins(message.trim());
    
    res.json({
      status: 'ok',
      result: result
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      status: 'error',
      message: 'ошибка сервера',
      error: err.message
    });
  }
});



export async function sendTlgMessageToAdmins(messageText = 'New order is payed') {
  try {
    console.log('Начинаем отправку сообщения всем админам...');
    
    // Получаем всех администраторов из БД
    const admins = await AdminsListModel.find();
    console.log(`Найдено админов: ${admins.length}`);
    
    if (admins.length === 0) {
      console.log('Нет админов в базе данных');
      return { status: 'no_admins' };
    }
    
    const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;
    const successfulSends = [];
    const failedSends = [];
    
    // Отправляем сообщение каждому админу
    for (const admin of admins) {
      try {
        const params = `?chat_id=${admin.tlgid}&text=${encodeURIComponent(messageText)}`;
        const url = baseurl + params;
        
        // console.log(`Отправляем сообщение админу ${admin.name} (${admin.tlgid})`);
        
        const response = await axios.get(url);
        
        if (response.data.ok) {
          // console.log(`✅ Сообщение успешно отправлено админу ${admin.name}`);
          successfulSends.push({ admin: admin.name, tlgid: admin.tlgid });
        } else {
          throw new Error(`Telegram API вернул API error: ${response.data.description || 'Unknown error'}`);
        }
        
      } catch (adminError) {
        // console.error(`❌ Ошибка при отправке админу ${admin.name} (${admin.tlgid}):`, adminError.message);
        failedSends.push({ admin: admin.name, tlgid: admin.tlgid, error: adminError.message });
      }
      
      // Небольшая задержка между отправками, чтобы не превысить rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`Результат отправки сообщений админам об оплаченном заказе: успешно - ${successfulSends.length}, ошибок - ${failedSends.length}`);
    
    return { 
      status: 'ok',
      totalAdmins: admins.length,
      successful: successfulSends.length,
      failed: failedSends.length,
      successfulSends,
      failedSends
    };
    
  } catch (err) {
    console.error('Ошибка в функции sendTlgMessageToAdmins:', err.message);
    console.error('Полная информация об ошибке:', err.response?.data);
    return { status: 'error', error: err.message };
  }
}

app.post('/api/user_sendTlgMessage', async (req, res) => {
  try {
    const { tlgid, eta, orderId } = req.body;

    // Проверка обязательных параметров
    if (!tlgid || !eta || !orderId) {
      return res.status(400).json({
        status: 'error',
        error: 'tlgid, eta and orderId are required'
      });
    }
    
    // console.log(`Отправка уведомления о доставке клиенту: tlgid=${tlgid}, eta=${eta}, orderId=${orderId}`);
    
    // Получаем язык пользователя из БД
    const user = await UserModel.findOneAndUpdate(
      { tlgid: tlgid },
      { crmStatus: 5,
        isWaitingAdminAction: false
       }
    );
    const language = user?.language || 'en'; // По умолчанию английский
    
    console.log(`Пользователь найден, язык: ${language}`);
    
    // Форматируем дату в формат dd.mm.yy
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${day}.${month}.${year}`;
    };
    
    const formattedEta = formatDate(eta);
    
    const templateText = {
      de: `🚚 Ihre Bestellung ist unterwegs!\n\nVoraussichtliches Lieferdatum: ${formattedEta}\n\nVielen Dank für Ihren Einkauf!`,
      en: `🚚 Your order is on the way!\n\nEstimated delivery date: ${formattedEta}\n\nThank you for your purchase!`,
      ru: `🚚 Ваш заказ отправлен!\n\nПримерная дата доставки: ${formattedEta}\n\nСпасибо за покупку!`
    };
    
    const messageText = templateText[language] || templateText['en'];
    
    // Отправляем сообщение через Telegram Bot API
    const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;
    const params = `?chat_id=${tlgid}&text=${encodeURIComponent(messageText)}`;
    const url = baseurl + params;
    
    const response = await axios.get(url);
    
    if (!response.data.ok) {
      throw new Error(`Telegram API error: ${response.data.description || 'Unknown error'}`);
    }
    
    console.log('Сообщение успешно отправлено клиенту');
    
    // Обновляем статус отправки в БД
    const updatedOrder = await OrdersModel.findByIdAndUpdate(
      orderId,
      { messageToClientAboutDelivery: true },
      { new: true }
    );
    
    if (!updatedOrder) {
      return res.status(404).json({
        status: 'error',
        error: 'Order not found'
      });
    }
    
    // console.log(`Обновлен статус messageToClientAboutDelivery для заказа ${orderId}`);
    
    res.json({
      status: 'ok',
      message: 'Message sent successfully',
      order: updatedOrder
    });
    
  } catch (err) {
    console.error('Ошибка в endpoint user_sendTlgMessage:', err.message);
    console.error('Полная информация об ошибке:', err.response?.data);
    
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});


// Проверка использования фильтра в товарах
app.post('/api/admin_check_filter_usage', async (req, res) => {
  try {
    const { filterId } = req.body;
    
    if (!filterId) {
      return res.status(400).json({
        error: 'Filter ID is required',
      });
    }

    console.log('[Database] Checking filter usage for ID:', filterId);
    
    // Ищем товары с этим типом (фильтром)
    const goodsWithFilter = await GoodsModel.find({ type: filterId });
    
    res.json({
      status: 'ok',
      isUsed: goodsWithFilter.length > 0,
      goodsCount: goodsWithFilter.length
    });
  } catch (error) {
    console.error('[Error] Failed to check filter usage:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// Удаление фильтра
app.post('/api/admin_delete_filter', async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({
        error: 'Filter ID is required',
      });
    }

    console.log('[Database] Deleting filter with ID:', id);
    
    const result = await GoodsTypesModel.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({
        error: 'Filter not found',
      });
    }

    console.log('[Database] Filter deleted successfully:', result.name_en);
    
    res.json({
      status: 'ok',
      message: 'Filter deleted successfully',
      deletedFilter: result
    });
  } catch (error) {
    console.error('[Error] Failed to delete filter:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
});

// получить персональные промокоды пользователя
app.get('/api/user_get_personal_promocodes', async (req, res) => {
  try {
    const { tlgid } = req.query;

    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'tlgid is required'
      });
    }

    // Находим пользователя по tlgid
    const user = await UserModel.findOne({ tlgid: Number(tlgid) });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Получаем персональные промокоды пользователя
    const personalPromocodes = await PromocodesPersonalModel.find({ 
      tlgid: user._id,
      isActive: true,
      isUsed: false
    }).sort({ createdAt: -1 });

    res.json({
      status: 'ok',
      promocodes: personalPromocodes
    });
  } catch (error) {
    console.error('[Error] Getting user personal promocodes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while getting personal promocodes',
      error: error.message
    });
  }
});

// создать пароль для входа админа
app.post('/api/create_passw', async (req, res) => {
  try {
    
    const { login, password } = req.body

    const doc = new AdminPasswordModel({
      login: login,
      password: password,
     
    });
    await doc.save();
    
    if (doc){
      return res.json({ status:'created' });

    }

  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// вход админа по логину и паролю
app.post('/api/admin_login', async (req, res) => {
  try {
    const { login, password } = req.body;

    // Валидация входных данных
    if (!login || !password) {
      return res.status(400).json({
        error: 'Login and password are required'
      });
    }

    console.log('[Auth] Admin login attempt for:', login);

    // Поиск администратора по логину
    const admin = await AdminPasswordModel.findOne({ login: login.trim() });

    if (!admin) {
      console.log('[Auth] Admin not found:', login);
      return res.status(401).json({
        error: 'Invalid login or password'
      });
    }

    // Сравнение пароля
    if (admin.password !== password.trim()) {
      console.log('[Auth] Invalid password for admin:', login);
      return res.status(401).json({
        error: 'Invalid login or password'
      });
    }

    console.log('[Auth] Admin login successful:', login);
    
    res.json({
      status: 'success',
      message: 'Login successful'
    });

  } catch (err) {
    console.error('[Error] Admin login error:', err);
    res.status(500).json({
      error: 'Server error',
      details: err.message
    });
  }
});




// списать баллы при покупке 
app.post('/api/writeoff_cashback', async (req, res) => {
  try {
    const { cashbackValue, userId } = req.body;

    if (!cashbackValue && !userId) {
      return res.status(400).json({
        status: 'error',
        message: 'Promocode and user is required'
      });
    }
       
    const user = await UserModel.findOne({ tlgid: userId });
    const userValute = user.valute;
    const userLanguage = user.language


     const codeApplied = {
      de: 'cashback-punkte wurden angewendet',
      en: 'cashback points were applied',
      ru: 'баллов списано'
     }


    const cart = await CartsModel.findOne({ tlgid: userId }).lean();
    
    const exchangeRates = await currencyConverter();

    // Подсчитываем количество товаров с isSaleNow = false
    let countItemsWithoutSale = 0;
    
    for (const item of cart.goods) {
      const good = await
    GoodsModel.findById(item.itemId);
      if (good && good.isSaleNow === false) {
        countItemsWithoutSale = countItemsWithoutSale + item.qty
      }
    }

    const writeOffFromEachItem = Number((cashbackValue/countItemsWithoutSale).toFixed(2))
    const writeOffFromEachItem_inEu = writeOffFromEachItem / exchangeRates[userValute]



    console.log('countItemsWithoutSale',countItemsWithoutSale)
    console.log('writeOffFromEachItem',writeOffFromEachItem)
    console.log('writeOffFromEachItem_inEu',writeOffFromEachItem_inEu)
    
    // return
    
          
    
    
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

          // если товар продается без скидки
          let price_eu_toReturn = (itemPrice - writeOffFromEachItem_inEu).toFixed(2)
          let priceToShow_toReturn = (Number(convertedPrice) - writeOffFromEachItem).toFixed(2)
          let isWithCashbackSale_toReturn = true
          let totalpriceItemWithCashback_toReturn = ((Number(convertedPrice) - writeOffFromEachItem)*itemQty).toFixed(2)


          // если товар продается уже по скидке
          if (good.isSaleNow){
            price_eu_toReturn = itemPrice.toFixed(2)
            priceToShow_toReturn = convertedPrice
            isWithCashbackSale_toReturn = false
            totalpriceItemWithCashback_toReturn = (convertedPrice * itemQty).toFixed(2)
          }


          return {
            name_en: good.name_en,
            name_de: good.name_de,
            name_ru: good.name_ru,
            price_eu: price_eu_toReturn,
            price_euNoCashbackApplied: itemPrice,
            priceToShow: priceToShow_toReturn,
            priceToShowNoPromoApplied: convertedPrice,
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
            totalpriceItemWithCashback: totalpriceItemWithCashback_toReturn,
            valuteToShow: userValute,
            isSaleNow: good.isSaleNow,
            isWithCashbackSale: isWithCashbackSale_toReturn,
            
            
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
    const totalPriceWithCashback = filteredGoods.reduce(
      (sum, item) => sum + Number(item.totalpriceItemWithCashback),
      0
    );

    

    return res.json({
      status: 'ok',
      goods: filteredGoods,
      totalQty: totalQty,
      valuteToShow: userValute,
      totalPriceCart: parseFloat(totalPrice.toFixed(2)), // Округляем до 2 знаков после запятой
      totalPriceCartWithCashback: parseFloat(totalPriceWithCashback.toFixed(2)),
      textForUser: `${cashbackValue} ${codeApplied[userLanguage]}`
    });

    

    

  } catch (error) {
    console.error('[Error] Checking promocode:', error);
    console.error('[Error] Stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server error while checking promocode',
      error: error.message
    });
  }
});


app.post('/api/create_new_referalPair', async (req, res) => {

try {

  console.log('запрос на реферальную пару пришел!!!')

  const { father, son, username } = req.body

  console.log('father = ',father)
  console.log('son = ',son)
  console.log('username = ',username)

  const doc = new ReferalsModel({
      father:father,
      son:son,
      username: username
    });

    console.log('doc=',doc)

    await doc.save();

    res.status(200).json({result: 'created'})

} catch (error) {
    console.error('[Error] creating ref pair:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error creating ref pair',
      error: error.message
    });
  }

})

// Получение рефералов
app.get('/api/get_referals', async (req, res) => {
  try {
    const { father, isSonEnterToApp } = req.query;
    
    console.log('Получение рефералов для father:', father);
    
    const query = { father: father };
    if (isSonEnterToApp === 'true') {
      query.isSonEnterToApp = true;
    }
    
    const referals = await ReferalsModel.find(query);
    
    res.status(200).json({
      status: 'ok',
      referals: referals
    });
    
  } catch (error) {
    console.error('Ошибка при получении рефералов:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении рефералов'
    });
  }
});






// === REFERALS PROMO FOR QUANTITY ENDPOINTS ===

// GET - получение всех записей referals_promoForQuantity
app.get('/api/referals_promoForQuantity', async (req, res) => {
  try {
    const items = await ReferalsPromoForQuantityModel.find().sort({ qty: 1 });
    
    res.status(200).json(items);
  } catch (error) {
    console.error('Ошибка при получении referals_promoForQuantity:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении данных'
    });
  }
});

// POST - создание новой записи referals_promoForQuantity
app.post('/api/referals_promoForQuantity', async (req, res) => {
  try {
    const { qty, sale, description } = req.body;
    
    console.log('Received data:', { qty, sale, description });
    
    // Валидация
    if (!qty || !sale || !description) {
      return res.status(400).json({
        status: 'error',
        error: 'All fields are required'
      });
    }
    
    const newItem = new ReferalsPromoForQuantityModel({
      qty: qty,
      sale: sale,
      description: description
    });
    
    await newItem.save();
    
    res.status(200).json({
      status: 'ok',
      item: newItem
    });
  } catch (error) {
    console.error('Ошибка при создании referals_promoForQuantity:', error);
    res.status(500).json({
      status: 'error',
      error: 'Ошибка при создании записи'
    });
  }
});

// PUT - обновление записи referals_promoForQuantity
app.put('/api/referals_promoForQuantity/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { qty, sale, description } = req.body;
    
    // Валидация
    if (!qty || !sale || !description) {
      return res.status(400).json({
        status: 'error',
        error: 'All fields are required'
      });
    }
    
    const updatedItem = await ReferalsPromoForQuantityModel.findByIdAndUpdate(
      id,
      { qty, sale, description },
      { new: true }
    );
    
    if (!updatedItem) {
      return res.status(404).json({
        status: 'error',
        error: 'Item not found'
      });
    }
    
    res.status(200).json({
      status: 'ok',
      item: updatedItem
    });
  } catch (error) {
    console.error('Ошибка при обновлении referals_promoForQuantity:', error);
    res.status(500).json({
      status: 'error',
      error: 'Ошибка при обновлении записи'
    });
  }
});

// DELETE - удаление записи referals_promoForQuantity
app.delete('/api/referals_promoForQuantity/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedItem = await ReferalsPromoForQuantityModel.findByIdAndDelete(id);
    
    if (!deletedItem) {
      return res.status(404).json({
        status: 'error',
        error: 'Item not found'
      });
    }
    
    res.status(200).json({
      status: 'ok',
      deletedItem: deletedItem
    });
  } catch (error) {
    console.error('Ошибка при удалении referals_promoForQuantity:', error);
    res.status(500).json({
      status: 'error',
      error: 'Ошибка при удалении записи'
    });
  }
});

// GET - получение всех записей referals_promoForPurchase
app.get('/api/referals_promoForPurchase', async (req, res) => {
  try {
    const items = await ReferalsPromoForPurchaseModel.find().sort({ createdAt: -1 });

    res.status(200).json(items);
  } catch (error) {
    console.error('Ошибка при получении referals_promoForPurchase:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении данных'
    });
  }
});

// POST - создание новой записи referals_promoForPurchase
app.post('/api/referals_promoForPurchase', async (req, res) => {
  try {
    const { purchaseAmount, sale, description } = req.body;

    console.log('Received purchase data:', { purchaseAmount, sale, description });

    // Валидация
    if (!purchaseAmount || !sale || !description) {
      return res.status(400).json({
        status: 'error',
        error: 'All fields are required'
      });
    }

    const newItem = new ReferalsPromoForPurchaseModel({
      purchaseAmount: purchaseAmount,
      sale: sale,
      description: description
    });

    await newItem.save();

    res.status(200).json({
      status: 'ok',
      item: newItem
    });
  } catch (error) {
    console.error('Ошибка при создании referals_promoForPurchase:', error);
    res.status(500).json({
      status: 'error',
      error: 'Ошибка при создании записи'
    });
  }
});

// PUT - обновление записи referals_promoForPurchase
app.put('/api/referals_promoForPurchase/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { sale } = req.body;

    console.log('sale=', sale)

    // Валидация
    if (typeof sale !== 'number' || sale < 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Sale field is required and must be 0 or positive number'
      });
    }

    const updatedItem = await ReferalsPromoForPurchaseModel.findByIdAndUpdate(
      id,
      { sale },
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({
        status: 'error',
        error: 'Item not found'
      });
    }

    res.status(200).json({
      status: 'ok',
      item: updatedItem
    });
  } catch (error) {
    console.error('Ошибка при обновлении referals_promoForPurchase:', error);
    res.status(500).json({
      status: 'error',
      error: 'Ошибка при обновлении записи'
    });
  }
});

// DELETE - удаление записи referals_promoForPurchase
app.delete('/api/referals_promoForPurchase/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deletedItem = await ReferalsPromoForPurchaseModel.findByIdAndDelete(id);

    if (!deletedItem) {
      return res.status(404).json({
        status: 'error',
        error: 'Item not found'
      });
    }

    res.status(200).json({
      status: 'ok',
      deletedItem: deletedItem
    });
  } catch (error) {
    console.error('Ошибка при удалении referals_promoForPurchase:', error);
    res.status(500).json({
      status: 'error',
      error: 'Ошибка при удалении записи'
    });
  }
});

// изменить статус isWaitingAdminAction (из админки)
app.post('/api/admin_update_waiting_status', async (req, res) => {
  try {
    const { userId, isWaitingAdminAction } = req.body;



    console.log('admin_update_waiting_status | userId=', userId, ' isWaitingAdminAction=', isWaitingAdminAction);

    // Валидация
    if (!userId || isWaitingAdminAction === undefined || isWaitingAdminAction === null) {
      return res.status(400).json({
        status: 'error',
        error: 'userId and isWaitingAdminAction are required'
      });
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        isWaitingAdminAction: isWaitingAdminAction
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    res.status(200).json({
      status: 'ok',
      user: updatedUser
    });
  } catch (error) {
    console.error('Ошибка при изменении параметра isWaitingAdminAction', error);
    res.status(400).json({
      status: 'error',
      error: 'Ошибка при изменении записи'
    });
  }
});

// получить заказы пользователя по tlgid (из админки)
app.get('/api/admin_get_user_orders/:tlgid', async (req, res) => {
  try {
    const { tlgid } = req.params;

    console.log('admin_get_user_orders | tlgid=', tlgid);

    // Валидация
    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        error: 'tlgid is required'
      });
    }

    // Находим заказы пользователя и популируем orderStatus
    const orders = await OrdersModel.find({ tlgid: tlgid })
      .populate('orderStatus')
      .sort({ createdAt: -1 }); // Сортируем по дате создания, новые первые

    res.status(200).json({
      status: 'ok',
      orders: orders
    });
  } catch (error) {
    console.error('Ошибка при получении заказов пользователя', error);
    res.status(400).json({
      status: 'error',
      error: 'Ошибка при получении заказов'
    });
  }
});

// переместить пользователя на следующий этап CRM (из админки)
app.post('/api/admin_move_user_to_next_stage', async (req, res) => {
  try {
    const { userId, newCrmStatus, isWaitingAdminAction, order } = req.body;

    console.log('admin_move_user_to_next_stage 6 | userId=', userId, ' order=', order );

    // Валидация
    if (!userId || !order  || newCrmStatus === undefined || newCrmStatus === null || isWaitingAdminAction === undefined || isWaitingAdminAction === null) {
      return res.status(400).json({
        status: 'error',
        error: 'userId, order, newCrmStatus and isWaitingAdminAction are required'
      });
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        crmStatus: newCrmStatus,
        isWaitingAdminAction: isWaitingAdminAction
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    const updatedOrder = await OrdersModel.findByIdAndUpdate(
      {_id: order},
      { orderStatus: '689b8af622baabcbb7047b9e' },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({
        status: 'error',
        error: 'Order not found'
      });
    }

    res.status(200).json({
      status: 'ok',
      user: updatedUser
    });
  } catch (error) {
    console.error('Ошибка при перемещении пользователя на следующий этап', error);
    res.status(400).json({
      status: 'error',
      error: 'Ошибка при изменении записи'
    });
  }
});

// изменить статус crmStatus (из JB)
app.post('/api/change_crmstatus', async (req, res) => {
  try {
    const { tlgid, crmstatus } = req.body;

    console.log('get from jb | tlgid=',tlgid, ' crmstatus=',crmstatus)

    // Валидация
    if (!tlgid || crmstatus === undefined || crmstatus === null) {
      return res.status(400).json({
        status: 'error',
        error: 'tlgid and crmStatus are required'
      });
    }

          const updatedUser = await UserModel.findOneAndUpdate(
            { tlgid: tlgid }, 
            {
              crmStatus: crmstatus
            },
            { new: true } 
          );

    res.status(200).json({
      status: 'changed',
    });
  } catch (error) {
    console.error('Ошибка при изменении статуса crmStatus', error);
    res.status(400).json({
      status: 'error',
      error: 'Ошибка при изменении записи'
    });
  }
});



// изменить инфо в Order (из JB)
app.post('/api/change_orderInfo', async (req, res) => {
  try {
    const { tlgid, orderid, answer } = req.body;

    console.log('get from jb | tlgid=',tlgid, ' orderid=',orderid, ' answer=',answer)

    // Валидация
    if (!tlgid || !orderid || !answer ) {
      return res.status(400).json({
        status: 'error',
        error: 'tlgid, orderid and answer are required'
      });
    }

          

          let answerToSet = false
          
          if (answer == 'yes') {
            answerToSet = true

            try {
            const resUser = await UserModel.findOneAndUpdate(
            { tlgid: tlgid }, 
            {
              crmStatus: 6,
              isWaitingAdminAction: false
            },
            { new: true } 
          );

            const jbid = resUser.jbid

             console.log('Обновил юзера успешно:', resUser);  
          } catch(error) {
            console.error('Ошибка обновления юзера:', error);
          }

          try {
              const resOrder = await
              OrdersModel.findOneAndUpdate(
                {_id: orderid},
                { orderStatus: '689b8af622baabcbb7047b9e' },      
                { new: true }
              );

              console.log('Обновлено order успешно:', resOrder);        
            } catch (error) {
              console.error('Ошибка обновления order:', error);
            }


            

            // отправить данные в JB
            const jbtoken = process.env.JB_TOKEN
            const jburlSetTag = process.env.JB_URL_SET_TAG
            const jburlUpdateVar = process.env.JB_URL_UPDATE_VAR

            const bodySetTag = {
              api_token: jbtoken,
              contact_id: jbid,
              name: "thanksMailing",
            }
  
    
            const bodyUpdateVar = {
              api_token: jbtoken,
              contact_id: jbid,
              name: "context",
              value: "series5_message1"
            }
    
    

            const safeRequest = async (url, body, headers) => {      
            try {
              return await axios.post(url, body, { headers });     
            } catch (error) {
              console.error('Request failed:', error.message);     
              return null;
            }
          };


        //добавлена задержка между запросами, чтоб JB успел переварить 5 одновременных запросов

          const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

          const response1 = await safeRequest(jburlSetTag, bodySetTag, {
            'Content-Type': 'application/json' });
          await delay(500);

          const response2 = await safeRequest(jburlUpdateVar, bodyUpdateVar, {
            'Content-Type': 'application/json' });
          await delay(500);


          if (response1 && response1.status >= 200 && response1.status < 300 ) {
                    console.log('response 1: данные в JB отправлены успешно');
          } else {
                    console.error('response 1: ошибка отправки данных в JB');
          }

          if (response2 && response2.status >= 200 && response2.status < 300 ) {
                    console.log('response 2: данные в JB отправлены успешно');
          } else {
                    console.error('response 2: ошибка отправки данных в JB');
          }


          }


          if (answer == 'no') {

            await UserModel.findOneAndUpdate(
            { tlgid: tlgid }, 
            {
              isWaitingAdminAction: true
            },
            { new: true } 
          );

          }
         

           await OrdersModel.findOneAndUpdate(
            { _id: orderid }, 
            {
              isUserConfirmDelivery: answerToSet
            },
            { new: true } 
          );

    res.status(200).json({
      status: 'changed',
    });
  } catch (error) {
    console.error('Ошибка при изменении статуса crmStatus', error);
    res.status(400).json({
      status: 'error',
      error: 'Ошибка при изменении записи'
    });
  }
});




// изменить статус crmStatus (из JB)
app.post('/api/change_waitadmin', async (req, res) => {
  try {
    const { tlgid, isWaitingAdminAction } = req.body;

    console.log('get from jb | tlgid=',tlgid, ' isWaitingAdminAction=',isWaitingAdminAction)

    // Валидация
    if (!tlgid || isWaitingAdminAction === undefined || isWaitingAdminAction === null) {
      return res.status(400).json({
        status: 'error',
        error: 'tlgid and waitadmin are required'
      });
    }

          const updatedUser = await UserModel.findOneAndUpdate(
            { tlgid: tlgid }, 
            {
              isWaitingAdminAction: isWaitingAdminAction
            },
            { new: true } 
          );

    res.status(200).json({
      status: 'changed',
    });
  } catch (error) {
    console.error('Ошибка при изменении параметра isWaitingAdminAction', error);
    res.status(400).json({
      status: 'error',
      error: 'Ошибка при изменении записи'
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

// Для тестов:
// 1) поместить файл env в эту папку
// 2) расскоменти две строки 'TEST'
// 3) закомменти 2 строки 'PROD'
// 4) расскоменти EXECUTE

// TEST
// import dotenv from 'dotenv';
// dotenv.config();

// EXECUTE
// executeCheckTask();

// PROD
import dotenv from 'dotenv';
dotenv.config({ path: '/root/wassermatrix/wassermatrixBack/.env' });

// import { logger } from '../middlewares/error-logger.js'

import mongoose from 'mongoose';
import axios from 'axios';


import CartsModel from '../models/carts.js';
import UserModel from '../models/user.js';
// import { createVerifiedPayout } from '../modelsOperations/models.services.js';


mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));


  export async function executeCheckTask() {
  try {
    console.log('Начинаю cron1: delete carts...');

    // 1) Записать сегодняшную дату в переменную todayDate
    const todayDate = new Date();

    // 2) Записать в массив allCarts все объекты
    const allCarts = await CartsModel.find();

    // 3) Пройтись циклом по всем элементам allCarts
    for (const cart of allCarts) {
      // 4) В переменную delta записать количество дней, сколько прошло с момента создания объекта в БД
      const createdDate = new Date(cart.createdAt);
      const timeDifference = todayDate.getTime() - createdDate.getTime();
      const delta = Math.floor(timeDifference / (1000 * 60 * 60 * 24)); // Конвертируем миллисекунды в дни

      if (delta == 6){
        // сообщение юзеру, что завтра удалим 

        console.log(`Cart ID: ${cart._id}, Days since creation: ${delta}`);

         const user = await UserModel.findOne(
              { tlgid: cart.tlgid }
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
                de: '⏳ Ihr Warenkorb wird morgen gelöscht',
                en: '⏳ Your cart will be deleted tomorrow',
                ru: '⏳ Завтра удалим вашу корзину'
              },
              subtitle: {
                de: 'Damit die Waren Ihnen sicher gehören – geben Sie Ihre Bestellung jetzt auf',
                en: 'To make sure you get the goods you want, place your order right now',
                ru: 'Чтобы товары остались за вами — оформите заказ прямо сейчас'
              },
              
              
              open: {
                de: 'öffnen',
                en: 'open',
                ru: 'открыть'
              }
            }
        
            
            const btnText = text.open[language]
        
            // Формируем сообщение для отправки в Telegram
            const message = `${text.title[language]}\n\n${text.subtitle[language]}`;
        
            // Отправляем сообщение через Telegram Bot API
            const telegramResponse = await axios.post(
              `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
              {
                chat_id: cart.tlgid,
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
        



      } else if ( delta >= 7) {
        await CartsModel.deleteOne({
          _id: cart._id
        })

        console.log(`Cart ID: ${cart._id}, Days since creation: ${delta}`);
        console.log('cart deleted')
      }

    }

  } catch (err) {
    console.log('error', err)
    return;
  }
}


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

         const user = await UserModel.findOneAndUpdate(
              { tlgid: cart.tlgid },
              { crmStatus: 0 }, 
              { new: true}
          );
            
          if (!user) {
              return res.status(404).json({
                error: 'User not found',
                status: 'error'
              });
            }

            
            
            const jbid = user.jbid  



           // отправить запрос в JB для создания тегов для дожима и рассылок
              const jbtoken = process.env.JB_TOKEN
              const jburlSetTag = process.env.JB_URL_SET_TAG
              // const jburlDelTag = process.env.JB_URL_DEL_TAG
              const jburlUpdateVar = process.env.JB_URL_UPDATE_VAR
          
              const bodySetTag = {
                api_token: jbtoken,
                contact_id: jbid,
                name: "crmStatus0",
              }
              
              // const bodyDelTag = {
              //   api_token: jbtoken,
              //   contact_id: jbid,
              //   name: "openBot",
              // }
              
              // const bodyDelTag2 = {
              //   api_token: jbtoken,
              //   contact_id: jbid,
              //   name: "crmStatus0",
              // }
              
              const bodyUpdateVar = {
                api_token: jbtoken,
                contact_id: jbid,
                name: "context",
                value: "crmStatus0"
              }
              
              const bodyUpdateVar2 = {
                api_token: jbtoken,
                contact_id: jbid,
                name: "crmStatus",
                value: "0"
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
          
            // const response2 = await safeRequest(jburlDelTag, bodyDelTag, {
            //   'Content-Type': 'application/json' });
            // await delay(500);
          
            // const response3 = await safeRequest(jburlDelTag, bodyDelTag2, {
            //   'Content-Type': 'application/json' });
            // await delay(500);
          
            const response2 = await safeRequest(jburlUpdateVar, bodyUpdateVar, {
              'Content-Type': 'application/json' });
            await delay(500);
          
            const response3 = await safeRequest(jburlUpdateVar, bodyUpdateVar2, {
              'Content-Type': 'application/json' });
          
            console.log('в JB внесены изменения')
            console.log('response 1', response1.status , response1.statusText)
            console.log('response 2', response2.status , response2.statusText)
            console.log('response 3', response3.status , response3.statusText)
            // console.log('response 4', response4.status , response4.statusText)
            // console.log('response 5', response5.status , response5.statusText)  















            
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


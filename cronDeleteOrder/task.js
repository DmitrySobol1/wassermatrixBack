// Для тестов:
// 1) поместить файл env в эту папку
// 2) расскоменти две строки 'TEST'
// 3) закомменти 2 строки 'PROD'
// 4) расскоменти EXECUTE

// TEST
// import dotenv from 'dotenv';
// dotenv.config();

// PROD
import dotenv from 'dotenv';
dotenv.config({ path: '/root/wassermatrix/wassermatrixBack/.env' });

// EXECUTE
// executeCheckTask();

// import { logger } from '../middlewares/error-logger.js'

import mongoose from 'mongoose';
import axios from 'axios';

import OrdersModel from '../models/orders.js';
import UserModel from '../models/user.js';
// import { creaeVerifiedPayout } from '../modelsOperations/models.services.js';

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

export async function executeCheckTask() {
  try {
    console.log('Начинаю cron2: delete orders or send msg about delivery...');

    // 1) Записать сегодняшную дату в переменную todayDate
    const todayDate = new Date();

    // 2) Записать в массив allOrders все объекты, исключая заказы со статусом 'delivered'
    const allOrders = await OrdersModel.find({
      orderStatus: { $ne: '689b8af622baabcbb7047b9e' }
    });


    // 3) Пройтись циклом по всем элементам allOrders
    for (const order of allOrders) {
      // для оплаченных
      if (order.eta && order.payStatus == true) {
        const etaDate = new Date(order.eta);
        const etaFormattedToSend = etaDate.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        });
        const timeDifferenceToPayedOrders =
          etaDate.getTime() - todayDate.getTime();
        const deltaPayed = Math.floor(
          timeDifferenceToPayedOrders / (1000 * 60 * 60 * 24)
        );

        console.log('дней до ETA=', deltaPayed);

        // напоминание, что завтра приедет заказ
        if (deltaPayed == 1 && order.payStatus == true) {
          console.log(`Order: Оплаченный, до дня доставки: ${deltaPayed} д.`);

          const user = await UserModel.findOne({ tlgid: order.tlgid });

          if (!user) {
            return;
          }

          const language = user.language;

          const text = {
            title: {
              de: '🚚 Ihre Bestellung wird in Kürze geliefert.',
              en: '🚚 Your order will be delivered soon',
              ru: '🚚 Заказ уже рядом',
            },
            subtitle: {
              de: 'voraussichtlicher Liefertermin: ',
              en: 'estimate date of delivery: ',
              ru: 'примерная дата доставки: ',
            },

            open: {
              de: 'öffnen',
              en: 'open',
              ru: 'открыть',
            },
          };

          const btnText = text.open[language];

          // Формируем сообщение для отправки в Telegram
          const message = `${text.title[language]}\n\n${text.subtitle[language]}${etaFormattedToSend}`;

          // Отправляем сообщение через Telegram Bot API
          const telegramResponse = await axios.post(
            `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
            {
              chat_id: order.tlgid,
              text: message,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: btnText,
                      web_app: {
                        url: process.env.FRONTEND_URL,
                      },
                    },
                  ],
                ],
              },
            }
          );

          console.log(
            '[Telegram] Message sent successfully:',
            telegramResponse.data
          );
        }
        // сообщение, получили ли посылку? (через 2 дня после ETA)
        else if (deltaPayed == -2 && order.payStatus == true && order.isUserConfirmDelivery == null) {
          console.log(
            `Order: Оплаченный, после доставки прошло: ${deltaPayed} д.`
          );

          const user = await UserModel.findOne({ tlgid: order.tlgid });

          if (!user) {
            return;
          }

          const language = user.language;

          const text = {
            title: {
              de: 'Haben Sie Ihre Bestellung erhalten❓',
              en: 'Have you received your order❓',
              ru: 'Вы получили заказ❓',
            },
            subtitle: {
              de: 'Markieren Sie die Bestellung in der App als erhalten. Gehen Sie zu «Konto» – «Meine Bestellungen»',
              en: 'Mark the order as received in the app. Go to «Account» - «My Orders»',
              ru: 'Отметьте в приложении, если заказ получен. Раздел «Кабинет» - «Мои заказы»',
            },

            open: {
              de: 'öffnen',
              en: 'open',
              ru: 'открыть',
            },

           
          };

          const btnText = text.open[language];

          // Формируем сообщение для отправки в Telegram
          const message = `${text.title[language]}\n\n${text.subtitle[language]}`;

          // Отправляем сообщение через Telegram Bot API
          const telegramResponse = await axios.post(
            `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
            {
              chat_id: order.tlgid,
              text: message,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                 [
                    {
                      text: btnText,
                      web_app: {
                        url: process.env.FRONTEND_URL,
                      },
                    },
                  ],
                ],
              },
            }
          );

          console.log(
            '[Telegram] Message sent successfully:',
            telegramResponse.data
          );

         
        }  
        
        // если юзер не нажал да/нет в сообщении о доставке
        else if (deltaPayed == -3 && order.payStatus == true && order.isUserConfirmDelivery == null) {

            await UserModel.findOneAndUpdate(
              { tlgid: order.tlgid },
              { isWaitingAdminAction: true }
            
            );
            
            


            console.log('пользователь не выбрал, что получил заказ, поменял isWaitingAdminAction=TRUE ')

        }
        
        
        
        else {
          console.log('no action with payed orders');
        }
      }

      //  для неоплаченных
      // 4) В переменную delta записать количество дней, сколько прошло с момента создания объекта в БД
      const createdDate = new Date(order.createdAt);
      const timeDifferenceToNotPayedOrders =
        todayDate.getTime() - createdDate.getTime();
      const deltaNotPayed = Math.floor(
        timeDifferenceToNotPayedOrders / (1000 * 60 * 60 * 24)
      );

      // сообщение юзеру, что завтра удалим заказ
      if (deltaNotPayed == 6 && order.payStatus == false) {
        console.log(
          `Order: неоплаченный, Days since creation: ${deltaNotPayed}`
        );

        const user = await UserModel.findOne({ tlgid: order.tlgid });

        if (!user) {
          return;
        }

        const language = user.language;

        const text = {
          title: {
            de: '❌ Wir werden Ihre Bestellung morgen löschen.',
            en: '❌ Your order will be deleted tomorrow',
            ru: '❌ Завтра удалим ваш заказ',
          },
          subtitle: {
            de: 'Damit die Waren Ihnen sicher gehören – geben Sie Ihre Bestellung jetzt auf',
            en: 'To make sure you get the goods you want, place your order right now',
            ru: 'Чтобы товары остались за вами — оформите заказ прямо сейчас',
          },

          open: {
            de: 'öffnen',
            en: 'open',
            ru: 'открыть',
          },
        };

        const btnText = text.open[language];

        // Формируем сообщение для отправки в Telegram
        const message = `${text.title[language]}\n\n${text.subtitle[language]}`;

        // Отправляем сообщение через Telegram Bot API
        const telegramResponse = await axios.post(
          `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
          {
            chat_id: order.tlgid,
            text: message,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: btnText,
                    web_app: {
                      url: process.env.FRONTEND_URL,
                    },
                  },
                ],
              ],
            },
          }
        );

        console.log(
          '[Telegram] Message sent successfully:',
          telegramResponse.data
        );

        // удаляем order
      } else if (deltaNotPayed >= 7) {
        const user = await UserModel.findOneAndUpdate(
          { tlgid: order.tlgid },
          { crmStatus: 0 },
          { new: true }
        );

        if (!user) {
          return;
        }

        const jbid = user.jbid;

        // отправить запрос в JB для создания тегов для дожима и рассылок
        const jbtoken = process.env.JB_TOKEN;
        const jburlSetTag = process.env.JB_URL_SET_TAG;
        // const jburlDelTag = process.env.JB_URL_DEL_TAG
        const jburlUpdateVar = process.env.JB_URL_UPDATE_VAR;

        const bodySetTag = {
          api_token: jbtoken,
          contact_id: jbid,
          name: 'crmStatus0',
        };

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
          name: 'context',
          value: 'crmStatus0',
        };

        const bodyUpdateVar2 = {
          api_token: jbtoken,
          contact_id: jbid,
          name: 'crmStatus',
          value: '0',
        };

        const safeRequest = async (url, body, headers) => {
          try {
            return await axios.post(url, body, { headers });
          } catch (error) {
            console.error('Request failed:', error.message);
            return null;
          }
        };

        //добавлена задержка между запросами, чтоб JB успел переварить 5 одновременных запросов
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        const response1 = await safeRequest(jburlSetTag, bodySetTag, {
          'Content-Type': 'application/json',
        });
        await delay(500);

        // const response2 = await safeRequest(jburlDelTag, bodyDelTag, {
        //   'Content-Type': 'application/json' });
        // await delay(500);

        // const response3 = await safeRequest(jburlDelTag, bodyDelTag2, {
        //   'Content-Type': 'application/json' });
        // await delay(500);

        const response2 = await safeRequest(jburlUpdateVar, bodyUpdateVar, {
          'Content-Type': 'application/json',
        });
        await delay(500);

        const response3 = await safeRequest(jburlUpdateVar, bodyUpdateVar2, {
          'Content-Type': 'application/json',
        });

        console.log('в JB внесены изменения');
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








        await OrdersModel.deleteOne({
          _id: order._id,
        });

        console.log(
          `Order ID: ${order._id}, Days since creation: ${deltaNotPayed}`
        );
        console.log('order deleted');
      } else {
        console.log('no orders to delete');
      }
    }
  } catch (err) {
    console.log('error', err);
    return;
  }
}

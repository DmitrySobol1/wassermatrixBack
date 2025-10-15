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

import mongoose from 'mongoose';
import PromocodesModel from '../models/promocodes.js';
import PromocodesPersonalModel from '../models/promocodesPersonal.js';

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

export async function executeCheckTask() {
  try {
    console.log('Начинаю cron3: deactivate expired promocodes...');

    // Получаем текущую дату (начало дня)
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    console.log('todayDate=',todayDate )

    // Деактивируем просроченные общие промокоды
    const resultGeneral = await PromocodesModel.updateMany(
      {
        expiryDate: { $lt: todayDate },
        isActive: true
      },
      {
        $set: { isActive: false }
      }
    );

    console.log(`Деактивировано общих промокодов: ${resultGeneral.modifiedCount}`);

    // Деактивируем просроченные персональные промокоды
    const resultPersonal = await PromocodesPersonalModel.updateMany(
      {
        expiryDate: { $lt: todayDate },
        isActive: true
      },
      {
        $set: { isActive: false }
      }
    );

    console.log(`Деактивировано персональных промокодов: ${resultPersonal.modifiedCount}`);

  } catch (err) {
    console.log('error', err);
    throw err;
  }
}

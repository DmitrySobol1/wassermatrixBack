import cron from 'node-cron';
import { executeCheckTask } from './task.js';

// import { logger } from '../middlewares/error-logger.js'

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wassermatrix/wassermatrixBack/.env' });


//Сценарий, для: 
// проверки корзин и отправки юзеру сообщения на 6ой день
// удаления корзины на 7ой день


cron.schedule(
  '1 0 * * *',
  async () => {
    console.log('🚀 Запуск CRON1 - delete carts', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ CRON1 выполнен');
    } catch (err) {
    console.error({
          cron_title: 'Ошибка в CRON 1 > при выполнении файла task.js',
          cron_message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        });
    }
  },
  {
    scheduled: true,
    timezone: 'UTC',
  }
);

console.log('⏰ Планировщик CRON1 инициализирован, check port=',process.env.PORT);

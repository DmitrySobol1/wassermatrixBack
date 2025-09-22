import cron from 'node-cron';
import { executeCheckTask } from './task.js';

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wassermatrix/wassermatrixBack/.env' });


//Сценарий, для: 
// проверки Orders и отправки юзеру сообщения на 6ой день
// удаления Order на 7ой день


cron.schedule(
  '*/2 * * * *',
  async () => {
    console.log('🚀 Запуск CRON2 - delete orders', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ CRON2 выполнен');
    } catch (err) {
    console.error({
          cron_title: 'Ошибка в CRON 2 > при выполнении файла task.js',
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

console.log('⏰ Планировщик CRON2 инициализирован, check port=',process.env.PORT);

import cron from 'node-cron';
import { executeCheckTask } from './task.js';

// import { logger } from '../middlewares/error-logger.js'

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wassermatrix/wassermatrixBack/.env' });


//Сценарий, для: 
// отслеживать промокоды, у которых истек срок действия и менять isActive = false
// поиск по БД Promocodes (общие)
// поиск по БД PersonalPromocodes (личные)


cron.schedule(
  '1 0 * * *',
  async () => {
    console.log('🚀 Запуск CRON3 - deactivate expired promocodes', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ CRON3 выполнен');
    } catch (err) {
    console.error({
          cron_title: 'Ошибка в CRON 3 > при выполнении файла task.js',
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

console.log('⏰ Планировщик CRON3 инициализирован, check port=',process.env.PORT);

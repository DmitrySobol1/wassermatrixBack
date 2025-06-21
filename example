import express from 'express';
import mongoose from 'mongoose';
import UserModel from './models/user.js';
import ComissionToPayoutModel from './models/comissionToPayout.js';
import ComissionToTransferModel from './models/comissionToTransfer.js';
import RqstTrtFromUserToMainModel from './models/rqstTrtFromUserToMain.js';
import VerifiedPayoutsModel from './models/verifiedPayouts.js';
import ComissionExchangeModel from './models/comissionToExchange.js';
import RqstPayInModel from './models/rqstPayIn.js';
import RqstTransferToOtherUserModel from './models/rqstTransferToOtherUser.js';
import RqstExchangeSchemaModel from './models/rqstExchange.js';
import crypto from 'crypto';

import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import speakeasy from 'speakeasy';
import axios from 'axios';

import { Convert } from 'easy-currencies';
import { TEXTS } from './texts.js';

import https from 'https';
import { totalmem } from 'os';
const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

const PORT = process.env.PORT || 4444;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

const app = express();

app.use(express.json());
app.use(cors());

app.get('/api', (req, res) => {
  res.send('hello man 88');
});

// вход пользователя в аппку
app.post('/api/enter', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });

    //создание юзера
    if (!user) {
      await createNewUser(req.body.tlgid);
      const userData = { result: 'showOnboarding' };
      // return res.json({ result: 'showOnboarding' });
      return res.json({ userData });
    }

    // извлечь инфо о юзере из БД и передать на фронт действие
    const { _id, ...userData } = user._doc;
    userData.result = 'showWalletPage';
    return res.json({ userData });

    // return res.json({ result: 'showFirstScreen' });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

app.get('/api/gettest', async (req, res) => {
  try {
    res.send('GET done from server');
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

app.get('/api/gettest2', (req, res) => {
  res.send('hello man 88');
});

app.post('/api/posttest', async (req, res) => {
  try {
    res.send('POST done from server');
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
      isOnboarded: false,
      isMemberEdChannel: null,
      jb_email: null,
      isLevelTested: false,
      level: null,
      nowpaymentid: 0,
      valute: 'eur',
      language: 'en',
    });

    const user = await doc.save();
  } catch (err) {
    console.log(err);
  }
}

// получение баланса пользователя
app.post('/api/get_user_balance', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });
    const { ...userData } = user._doc;

    const nowpaymentid = userData.nowpaymentid;
    const language = userData.language;

    const valute = userData.valute;

    let symbol = '₽';
    if (valute === 'usd') {
      symbol = '$';
    } else if (valute === 'eur') {
      symbol = '€';
    }

    if (userData.nowpaymentid === 0) {
      return res.json({
        balance: 0,
        language: language,
        valute: valute,
        symbol: symbol,
      });
      // return res.json({ balance: 0, language:language, valute:valute });
    }

    let cryptoPrices = await getCryptoPrices();

    const response = await axios.get(
      `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    const userBalance = response.data.result.balances;

    // Преобразовываем объект в массив объектов
    const arrayOfUserBalance = Object.entries(userBalance).map(
      ([key, value]) => ({
        currency: key, // кладем ключ внутрь объекта
        ...value, // распаковываем остальные свойства
      })
    );

    const arrayOfUserBalanceWithUsdPrice = arrayOfUserBalance.map((item) => {
      // находим подходящий объект из cryptoPrices
      const matchingPrice = cryptoPrices.find(
        (price) => item.currency.toLowerCase() === price.symbol.toLowerCase()
      );

      // возвращаем новый объект с необходимой информацией
      return {
        currency: item.currency,
        amount: item.amount,
        price_usd: matchingPrice?.price_usd ?? null, // если нет подходящей цены, ставим null
      };
    });

    const userBalanceInUsd = arrayOfUserBalanceWithUsdPrice.reduce(
      (accumulator, item) => {
        return accumulator + item.amount * item.price_usd;
      },
      0
    );

    // получение курса доллара в валюте клиента
    if (valute === 'usd') {
      const roundedBalance = parseFloat(userBalanceInUsd.toFixed(2));
      return res.json({
        balance: roundedBalance,
        valute: valute,
        symbol: '$',
        language: language,
      });
    } else if (valute === 'eur') {
      const balance = await Convert(userBalanceInUsd).from('USD').to('EUR');
      const roundedBalance = parseFloat(balance.toFixed(2));
      return res.json({
        balance: roundedBalance,
        valute: valute,
        symbol: '€',
        language: language,
      });
    } else if (valute === 'rub') {
      const balance = await Convert(userBalanceInUsd).from('USD').to('RUB');
      const roundedBalance = parseFloat(balance.toFixed(2));
      return res.json({
        balance: roundedBalance,
        valute: valute,
        symbol: '₽',
        language: language,
      });
    }

    return res.json({ userBalanceInUsd: userBalanceInUsd });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// получение данных о стоимости крипты
async function getCryptoPrices() {
  const response = await axios.get('https://api.coinlore.net/api/tickers/');

  return response.data.data;
}

// получение из nowpayments монет, одобренных в ЛК
app.get('/api/get_available_coins', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.nowpayments.io/v1/merchant/coins',
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    return res.json(response.data);
  } catch (err) {
    console.log(err);
    res.json({
      message: 'ошибка сервера',
    });
  }
});

// смена валюты в БД
app.post('/api/change_valute', async (req, res) => {
  await UserModel.findOneAndUpdate(
    { tlgid: req.body.tlgid },
    { $set: { valute: req.body.valute } }
  );

  return res.json('OK');
});

// смена языка в БД
app.post('/api/change_language', async (req, res) => {
  await UserModel.findOneAndUpdate(
    { tlgid: req.body.tlgid },
    { $set: { language: req.body.language } }
  );

  return res.json('OK');
});

// получение информации, чтобы вернуть адресс и мин сумму пополнения, создать ЛК юзера в NP ?
app.post('/api/get_info_for_payinadress', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });
    const { ...userData } = user._doc;

    const token = await getTokenFromNowPayment();

    if (userData.nowpaymentid === 0) {
      const nowpaymentid = await createUserInNowPayment(token, req.body.tlgid);

      //записать nowpaymentid в БД
      const updatedUser = await UserModel.findOneAndUpdate(
        { tlgid: req.body.tlgid },
        { $set: { nowpaymentid: nowpaymentid } },
        { new: true } // Вернуть обновленную запись
      );

      const { ...userData } = updatedUser._doc;
    }

    const minAmount = await getMinAmountForDeposit(req.body.coin);

    const payAdress = await createPayAdress(
      token,
      req.body.coin,
      minAmount,
      userData.nowpaymentid,
      req.body.tlgid
    );

    const objToFront = {
      minAmount,
      payAdress,
    };

    return res.json(objToFront);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

async function getTokenFromNowPayment() {
  const response = await axios.post(
    'https://api.nowpayments.io/v1/auth',
    {
      email: process.env.NOWPAYMENTSEMAIL,
      password: process.env.NOWPAYMENTSPASSWD,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.token;
}

async function getMinAmountForDeposit(coin) {
  const response = await axios.get(
    `https://api.nowpayments.io/v1/min-amount?currency_from=${coin}&fiat_equivalent=usd&is_fixed_rate=false&is_fee_paid_by_user=false`,
    {
      headers: {
        'x-api-key': process.env.NOWPAYMENTSAPI,
      },
    }
  );

  return response.data.min_amount;
}

async function createUserInNowPayment(token, tlgid) {
  try {
    // 1. Валидация входных параметров
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid or missing authentication token');
    }

    if (!tlgid || (typeof tlgid !== 'string' && typeof tlgid !== 'number')) {
      throw new Error('Invalid tlgid format');
    }

    // 2. Формирование тела запроса (уточните правильную структуру в API-документации)
    const requestData = {
      name: String(tlgid),
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/balance',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    // 4. Проверка структуры ответа
    if (!response.data?.result?.id) {
      throw new Error('Invalid response structure from NowPayments API');
    }

    return response.data.result.id;
  } catch (error) {
    console.error('Error in createUserInNowPayment:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

async function createPayAdress(token, coin, minAmount, nowpaymentid, tlgid) {
  try {
    // 1. Валидация входных параметров
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid or missing authentication token');
    }

    if (!coin || typeof coin !== 'string') {
      throw new Error('Invalid coin format');
    }

    if (!minAmount || (typeof coin !== 'number' && typeof coin !== 'string')) {
      throw new Error('Invalid minAmount format');
    }

    if (
      !nowpaymentid ||
      (typeof nowpaymentid !== 'number' && typeof nowpaymentid !== 'string')
    ) {
      throw new Error('Invalid nowpaymentid format');
    }

    // 2. Формирование тела запроса
    const requestData = {
      currency: coin,
      amount: Number(minAmount),
      sub_partner_id: String(nowpaymentid),
      is_fixed_rate: false,
      is_fee_paid_by_user: false,
      ipn_callback_url: 'https://wolf-wallet.ru/api/webhook_payin',
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/payment',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': process.env.NOWPAYMENTSAPI,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    // 4. Проверка структуры ответа
    if (!response.data?.result?.pay_address) {
      throw new Error('Invalid response structure from NowPayments API');
    }

    await createNewRqstPayIn(response.data.result, tlgid, nowpaymentid);
    return response.data.result.pay_address;
  } catch (error) {
    console.error('Error in createUserInNowPayment:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

//создать запись в БД о новом запросе на ввод
async function createNewRqstPayIn(params, tlgid, nowpaymentid) {
  try {
    const doc = new RqstPayInModel({
      payment_id: params.payment_id,
      payment_status: params.payment_status,
      pay_amount: params.pay_amount,
      price_currency: params.price_currency,
      userIdAtNP: nowpaymentid,
      amount_received: params.amount_received,
      tlgid: tlgid,
    });

    const rqst = await doc.save();
  } catch (err) {
    console.log(err);
  }
}

//TODO:
// получение баланса юзера, для вывода в "пополнить" и на странице wallet tab активы
app.get('/api/get_balance_for_pay_out', async (req, res) => {
  try {
    const tlgid = req.query.tlgid;
    // const tlgid = req.body.tlgid;

    const user = await UserModel.findOne({ tlgid: tlgid });
    const valute = user.valute;

    // console.log('step 1');
    // console.log('user=', user);
    // console.log('valute', valute);
    // // return res.json('ok1');

    if (user) {
      const nowpaymentid = user._doc.nowpaymentid;

      // const response = await axios.get(
      //   `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,

      //   {
      //     headers: {
      //       'x-api-key': process.env.NOWPAYMENTSAPI,
      //     },
      //   }
      // );

      // =============

      let cryptoPrices = await getCryptoPrices();

      // console.log('step 2');
      // console.log('cryptoPrices', cryptoPrices);
      // // return res.json('ok2');

      const response = await axios.get(
        `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,
        {
          headers: {
            'x-api-key': process.env.NOWPAYMENTSAPI,
          },
        }
      );

      const userBalance = response.data.result.balances;

      // console.log('step 3');
      // console.log('response=', response.data.result);
      // return res.json('ok3');

      // Преобразовываем объект в массив объектов
      const arrayOfUserBalance = Object.entries(userBalance).map(
        ([key, value]) => ({
          currency: key, // кладем ключ внутрь объекта
          ...value, // распаковываем остальные свойства
        })
      );

      console.log('step 4');
      console.log('arrayOfUserBalance=', arrayOfUserBalance);
      // return res.json('ok4');

      let fiatKoefficient = 1;
      let symbol = '$';
      if (valute === 'eur') {
        fiatKoefficient = await Convert(1).from('USD').to('EUR');
        symbol = '€';
      } else if (valute === 'rub') {
        fiatKoefficient = await Convert(1).from('USD').to('RUB');
        symbol = '₽';
      }

      const arrayOfUserBalanceWithUsdPrice = arrayOfUserBalance
        .map((item) => {
          const matchingPrice = cryptoPrices.find(
            (price) =>
              item.currency.toLowerCase() === price.symbol.toLowerCase()
          );

          const amount = item.amount != null ? parseFloat(item.amount) : 0;
          const priceUsd = parseFloat(matchingPrice?.price_usd) || 0;
          const fiatK = parseFloat(fiatKoefficient) || 0;


          const epsilon = 1e-20

          if (amount > 0 && Math.abs(amount - 2e-18) > epsilon ) {
            const priceAllCoinInUsd = (amount * priceUsd).toFixed(2);
            const priceAllCoinInUserFiat = (priceAllCoinInUsd * fiatK).toFixed(
              2
            );

            return {
              currency: item.currency,
              amount: amount,
              price_usd: priceUsd,
              priceAllCoinInUsd: priceAllCoinInUsd,
              priceAllCoinInUserFiat: priceAllCoinInUserFiat,
              symbol: symbol,
            };
          }
          return null; // или return {};
        })
        .filter(Boolean); // Удаляет null/undefined из массива;

      // console.log('step 5');
      // console.log('arrayOfUserBalanceWithUsdPrice=', arrayOfUserBalanceWithUsdPrice);
      // return res.json('ok5');
      // =================

      // TODO: проверить верность подсчета коэффициента

      return res.json({ arrayOfUserBalanceWithUsdPrice });
    } else {
      console.log('такого нет');
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// проверка валидности адреса кошелька
app.post('/api/validate_adress', async (req, res) => {
  try {
    const validateResult = await validateAdress(req.body.adress, req.body.coin);

    if (validateResult === 'OK') {
      return res.json(validateResult);
    } else {
      return res.json('not ok');
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

async function validateAdress(adress, coin) {
  try {
    const requestData = {
      address: String(adress),
      currency: String(coin),
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/payout/validate-address',
      requestData,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    if (response.data == 'OK') {
      console.log(response.data);
      return response.data;
    }
  } catch (error) {
    console.error('Error in validateAdress', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Error adress: ${error.message}`);
  }
}

//сохранить новую комиссию за вывод
app.post('/api/save_new_comission', async (req, res) => {
  const doc = new ComissionToPayoutModel({
    qty: 1,
    coin: 'btc',
  });

  const comission = await doc.save();
});

// получить сумму комиссий
app.get('/api/get_comission', async (req, res) => {
  try {
    const comission = await ComissionToPayoutModel.findOne({
      coin: req.query.coin,
    });

    console.log('com=', comission);
    return res.json({ comission });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

//сохранить новую комиссию за обмен (числа в процентах!!!!!)
app.post('/api/save_new_comissionExchange', async (req, res) => {
  const doc = new ComissionExchangeModel({
    qty: req.body.qty, // в процентах!!!!
    coin: req.body.coin,
  });

  const comission = await doc.save();

  res.json({
    message: 'new saved',
  });
});

// получить список комиссий за обмен
app.get('/api/get_comissionExchange', async (req, res) => {
  try {
    const commissions = await ComissionExchangeModel.find().lean();

    if (!commissions.length) {
      return res.status(404).json({ status: 'no found' });
    }

    res.json({
      status: 'success',
      data: commissions,
    });
  } catch (error) {
    res.status(500).json({ status: 'server error', error: error.message });
  }
});

//создать запрос на вывод монет (перевод с юзер счета на мастер счет)
app.post('/api/rqst_to_payout', async (req, res) => {
  try {
    const token = await getTokenFromNowPayment();

    // найти nowPayment id по тлг id
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });

    if (!user) {
      return res.status(404).send('Пользователь не найден');
    }

    const nowpaymentid = user._doc.nowpaymentid;

    const requestData = {
      currency: String(req.body.coin),
      amount: Number(req.body.sum),
      sub_partner_id: String(nowpaymentid),
    };

    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/write-off',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    if (response.data.result.status === 'PROCESSING') {
      const transactionId = response.data.result.id;

      console.log('transactionId=', response.data.result);

      const createRqst = await createRqstTrtFromuserToMain(
        transactionId,
        req.body.coin,
        req.body.sum,
        nowpaymentid,
        req.body.adress,
        req.body.networkFees,
        req.body.ourComission,
        req.body.qtyToSend,
        req.body.qtyForApiRqst
      );

      if (createRqst === 'created') {
        console.log('createRqst=', createRqst);
        return res.json({ status: 'OK' });
      }
    }
  } catch (error) {
    console.error('Error in createRqstTrtFromuserToMain', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Error adress: ${error.message}`);
  }
});

async function createRqstTrtFromuserToMain(
  transactionId,
  coin,
  sum,
  userIdAtNP,
  adress,
  networkFees,
  ourComission,
  qtyToSend,
  qtyForApiRqst,
  type
) {
  try {
    const rqst = new RqstTrtFromUserToMainModel({
      transactionId: transactionId,
      coin: coin,
      sum: sum,
      status: 'new',
      userIdAtNP: userIdAtNP,
      adress: adress,
      networkFees: networkFees,
      ourComission: ourComission,
      qtyToSend: qtyToSend,
      qtyForApiRqst: qtyForApiRqst,
      type: type,
    });

    const user = await rqst.save();
    return 'created';
  } catch (err) {
    console.log(err);
  }
}

// для обработки "вывода" средств
app.post('/api/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Получен вебхук payout:', payload);

    // 1. Проверяем обязательный заголовок
    const receivedSignature = req.headers['x-nowpayments-sig'];
    if (!receivedSignature) {
      console.log('Отсутствует заголовок подписи');
      return res.status(400).json({ error: 'Missing signature header' });
    }

    // 2. Безопасная сортировка объекта
    const safeSort = (obj) => {
      const seen = new WeakSet();
      const sort = (obj) => {
        if (obj !== Object(obj)) return obj;
        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);

        return Object.keys(obj)
          .sort()
          .reduce((result, key) => {
            result[key] = sort(obj[key]);
            return result;
          }, {});
      };
      return sort(obj);
    };

    // 3. Генерация и проверка подписи
    const hmac = crypto.createHmac('sha512', process.env.IPN_SECRET_KEY);
    hmac.update(JSON.stringify(safeSort(payload)));
    const expectedSignature = hmac.digest('hex');

    // 4. Безопасное сравнение подписей
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      console.log('Неверная подпись');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    console.log('Подписи совпадают');

    // 5. Обработка вебхука (с обработкой ошибок)
    try {
      res.status(200).json({ status: 'success' });
      //TODO: добавить логику, если приходит reject - чтобы пользователю написать msg и вернуть средства с master на его аккаунт

      await processWebhookPayout(payload);
    } catch (processError) {
      console.error('Ошибка обработки:', processError);
      res.status(500).json({ error: 'Processing failed' });
    }
  } catch (error) {
    console.error('Ошибка обработки вебхука:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// функция обработки вывод средств (payout)
async function processWebhookPayout(payload) {
  console.log('Обрабатываю:', payload);

  const statusLowerLetter = payload.status.toLowerCase();

  const updatedItem = await VerifiedPayoutsModel.findOneAndUpdate(
    { batch_withdrawal_id: payload.batch_withdrawal_id },
    { $set: { status: statusLowerLetter } }
  );

  console.log('Статус=', payload.status.toLowerCase());

  if (payload.status.toLowerCase() === 'finished') {
    const foundUser = await UserModel.findOne({
      nowpaymentid: updatedItem.userIdAtNP,
    });
    const coin = payload.currency;
    const language = foundUser.language;
    const tlgid = foundUser.tlgid;
    const type = 'payout';
    const textQtyCoins = Number(
      (Number(payload.amount) - Number(payload.fee)).toFixed(6)
    );

    const textToSendUser = textQtyCoins + ' ' + coin.toUpperCase();
    console.log('переход к функции сенд мсг');
    sendTlgMessage(tlgid, language, type, textToSendUser);
  }
}

// для обработки "ввода" средств
app.post('/api/webhook_payin', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Получен вебхук payin:', payload);

    // 1. Проверяем обязательный заголовок
    const receivedSignature = req.headers['x-nowpayments-sig'];
    if (!receivedSignature) {
      console.log('Отсутствует заголовок подписи');
      return res.status(400).json({ error: 'Missing signature header' });
    }

    // 2. Безопасная сортировка объекта
    const safeSort = (obj) => {
      const seen = new WeakSet();
      const sort = (obj) => {
        if (obj !== Object(obj)) return obj;
        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);

        return Object.keys(obj)
          .sort()
          .reduce((result, key) => {
            result[key] = sort(obj[key]);
            return result;
          }, {});
      };
      return sort(obj);
    };

    // 3. Генерация и проверка подписи
    const hmac = crypto.createHmac('sha512', process.env.IPN_SECRET_KEY);
    hmac.update(JSON.stringify(safeSort(payload)));
    const expectedSignature = hmac.digest('hex');

    // 4. Безопасное сравнение подписей
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      console.log('Неверная подпись');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    console.log('Подписи совпадают');

    // 5. Обработка вебхука (с обработкой ошибок)
    try {
      res.status(200).json({ status: 'success' });
      //TODO: добавить логику, если приходят остальные статусы - как то оповещать юзера

      await processWebhookPayin(payload);
    } catch (processError) {
      console.error('Ошибка обработки:', processError);
      res.status(500).json({ error: 'Processing failed' });
    }
  } catch (error) {
    console.error('Ошибка обработки вебхука:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//FIXME:
// функция обработки payIn со статусом finished
async function processWebhookPayin(payload) {
  console.log('Обрабатываю payin:', payload);

  //поменять статус в БД
  const updatedItem = await RqstPayInModel.findOneAndUpdate(
    { payment_id: payload.payment_id },
    {
      $set: {
        payment_status: payload.payment_status.toLowerCase(),
        amount_received: payload.outcome_amount,
      },
    }
  );

  console.log('Статус payin=', payload.payment_status.toLowerCase());

  if (payload.payment_status.toLowerCase() === 'finished') {
    const userFromRqstBase = await RqstPayInModel.findOne({
      payment_id: payload.payment_id,
    });
    const tlgid = userFromRqstBase.tlgid;

    const userFromUserBase = await UserModel.findOne({
      tlgid: tlgid,
    });

    const language = userFromUserBase.language;
    const type = 'payin';
    const coin = payload.price_currency;
    const sumToReceived = payload.outcome_amount;
    const textToSendUser = sumToReceived + ' ' + coin.toUpperCase();
    console.log('переход к функции сенд мсг');
    sendTlgMessage(tlgid, language, type, textToSendUser);
  }
}

function sendTlgMessage(tlgid, language, type, textQtyCoins) {
  const { title, text } = TEXTS[type]?.[language];
  const fullText = text + textQtyCoins;

  // const sendingText = TEXTS[language].text;
  const params = `?chat_id=${tlgid}&text=${title}%0A${fullText}`;
  const url = baseurl + params;

  https
    .get(url, (response) => {
      let data = '';

      // Когда запрос завершён
      response.on('end', () => {
        console.log(JSON.parse(data)); // Выводим результат
      });
    })
    .on('error', (err) => {
      console.error('Ошибка:', err);
    });
}

//статистика пополнения баланса
app.get('/api/get_my_payin', async (req, res) => {
  try {
    if (!req.query.tlgid) {
      return res.status(400).json({ message: 'Параметр tlgid обязателен' });
    }

    const payins = await RqstPayInModel.find({
      payment_status: 'finished',
      tlgid: req.query.tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const transfers = await RqstTransferToOtherUserModel.find({
      statusAll: 'finished',
      toUserTlgid: req.query.tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const exchange = await RqstExchangeSchemaModel.find({
      status: 'done',
      tlgid: req.query.tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();



    if (
      (!payins && !transfers && !exchange) ||
      (payins.length === 0 && transfers.length === 0 && exchange.length === 0)
    ) {
      return res.status(200).json({ status: 'no' });
    }

    const months = [
      'янв',
      'фев',
      'мар',
      'апр',
      'мая',
      'июн',
      'июл',
      'авг',
      'сен',
      'окт',
      'ноя',
      'дек',
    ];

    const processedPayins = payins.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.price_currency,
        qty: item.amount_received,
        formattedDate: `${day} ${month} ${hours}:${minutes}`,
        type: 'payin',
        forSort: item.updatedAt,
      };
    });

    const processedTransfers = transfers.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.coin,
        qty: item.qtyToTransfer,
        formattedDate: `${day} ${month} ${hours}:${minutes}`,
        type: 'transfer',
        forSort: item.updatedAt,
      };
    });


    const processedExchanges = exchange.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.coinTo,
        qty: item.amountTo,
        formattedDate: `${day} ${month} ${hours}:${minutes}`,
        type: 'exchange',
        forSort: item.updatedAt,
      };
    });





    const total = [...processedPayins, ...processedTransfers, ...processedExchanges].sort(
      (a, b) => b.forSort - a.forSort
    );

    console.log('total', total);

    return res.status(200).json({
      status: 'ok',
      count: total.length,
      data: total,
    });
    // return res.status(200).json({
    //   status: 'ok',
    //   count: processedPayins.length,
    //   data: processedPayins,
    // });
  } catch (err) {
    console.error('Ошибка в /api/get_my_payin:', err);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
});

//статистика вывода с баланса
app.get('/api/get_my_payout', async (req, res) => {
  try {
    const tlgid = req.query.tlgid;

    if (!tlgid) {
      return res.status(400).json({ message: 'Параметр tlgid обязателен' });
    }

    const user = await UserModel.findOne({ tlgid: tlgid });
    const { ...userData } = user._doc;

    const nowpaymentid = userData.nowpaymentid;

    const payouts = await VerifiedPayoutsModel.find({
      status: 'finished',
      userIdAtNP: nowpaymentid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const transfers = await RqstTransferToOtherUserModel.find({
      statusAll: 'finished',
      fromUserTlgid: tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();


    const exchange = await RqstExchangeSchemaModel.find({
      status: 'done',
      tlgid: req.query.tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();  

    if (
      (!payouts && !transfers && !exchange) ||
      (payouts.length === 0 && transfers.length === 0 && exchange.length === 0)
    ) {
      return res.status(200).json({ status: 'no' });
    }

    const months = [
      'янв',
      'фев',
      'мар',
      'апр',
      'мая',
      'июн',
      'июл',
      'авг',
      'сен',
      'окт',
      'ноя',
      'дек',
    ];

    const processedPayouts = payouts.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      // Ошибка 2: Возвращаем новый объект, а не мутируем исходный
      // return {
      //   ...item,
      //   formattedDate: `${day} ${month} ${hours}:${minutes}`,
      // };

      return {
        coin: item.coin,
        qty: item.qtyToSend,
        formattedDate: `${day} ${month} ${hours}:${minutes}`,
        type: 'payout',
        forSort: item.updatedAt,
      };
    });

    const processedTransfers = transfers.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      // Ошибка 2: Возвращаем новый объект, а не мутируем исходный
      // return {
      //   ...item,
      //   formattedDate: `${day} ${month} ${hours}:${minutes}`,
      // };

      return {
        coin: item.coin,
        qty: item.qtyToTransfer,
        formattedDate: `${day} ${month} ${hours}:${minutes}`,
        type: 'transfer',
        forSort: item.updatedAt,
      };
    });


     const processedExchanges = exchange.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.coinFrom,
        qty: item.amountFrom,
        formattedDate: `${day} ${month} ${hours}:${minutes}`,
        type: 'exchange',
        forSort: item.updatedAt,
      };
    });



    const total = [...processedPayouts, ...processedTransfers, ...processedExchanges].sort(
      (a, b) => b.forSort - a.forSort
    );

    console.log('total', total);

    return res.status(200).json({
      status: 'ok',
      count: total.length,
      data: total,
    });
  } catch (err) {
    console.error('Ошибка в /api/get_my_payout:', err);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
});

//получить мин сумму для вывода и нашу комиссию
app.get('/api/get_info_for_payout', async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.nowpayments.io/v1/payout-withdrawal/min-amount/${req.query.coin}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    let status = false;

    let minSumToWithdraw = 'not available';
    if (response.data && response.data.success === true) {
      minSumToWithdraw = response.data.result;
    }

    let ourComission = 'not available';
    const comission = await ComissionToPayoutModel.findOne({
      coin: req.query.coin,
    });
    if (comission) {
      ourComission = Number(comission.qty);
    }

    if (
      minSumToWithdraw !== 'not available' &&
      ourComission !== 'not available'
    ) {
      status = true;
    }

    return res.json({
      minSumToWithdraw,
      ourComission,
      status,
      coin: req.query.coin,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

//получить комиссию сети за вывод монеты
app.get('/api/get_withdrawal_fee', async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.nowpayments.io/v1/payout/fee?currency=${req.query.coin}&amount=${req.query.amount}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    let networkFees = false;

    if (response.data) {
      networkFees = response.data.fee;
    }

    return res.json({ networkFees });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// получение инфо о nowpayment id + создать, если не существует
app.post('/api/get_user_id', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });
    const { ...userData } = user._doc;

    const nowpaymentid = userData.nowpaymentid;

    console.log(userData);

    // if (userData.nowpaymentid === 0) {
    //   // вернуть на фронт, что не существует
    //   return res.json({ nowpaymentid: 0 });

    // }

    // const response = await axios.get(
    //   `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,
    //   {
    //     headers: {
    //       'x-api-key': process.env.NOWPAYMENTSAPI,
    //     },
    //   }
    // );

    return res.json({ nowpaymentid: nowpaymentid });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// создать id в nowpayment
app.post('/api/create_user_NpId', async (req, res) => {
  try {
    const token = await getTokenFromNowPayment();

    const nowpaymentid = await createUserInNowPayment(token, req.body.tlgid);

    const updatedUser = await UserModel.findOneAndUpdate(
      { tlgid: req.body.tlgid },
      { $set: { nowpaymentid: nowpaymentid } },
      { new: true } // Вернуть обновленную запись
    );

    console.log('UPDATED USER=', updatedUser);

    return res.json({ nowpaymentid: nowpaymentid });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

//сохранить новую комиссию за трансфер
app.post('/api/save_new_transfercomission', async (req, res) => {
  const doc = new ComissionToTransferModel({
    qty: 0.01,
    coin: 'ton',
  });

  const comission = await doc.save();
  return res.json({ status: 'saved' });
});

//получить нашу комиссию за трансфер между пользователями
app.get('/api/get_transfer_fee', async (req, res) => {
  try {
    const fees = await ComissionToTransferModel.findOne({
      coin: req.query.coin,
    });

    const user = await UserModel.findOne({
      tlgid: req.query.tlgid,
    });

    let selfNowpaymentid = 0;
    if (user) {
      selfNowpaymentid = user.nowpaymentid;
    }

    if (fees) {
      const response = {
        ...fees.toObject(),
        selfNowpaymentid,
        status: 'ok',
      };

      return res.json(response);
    } else {
      return res.status(404).json({
        status: 'coin not found',
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'ошибка сервера',
    });
  }
});

// проверка существует ли юзер
app.post('/api/get_user', async (req, res) => {
  try {
    const token = await getTokenFromNowPayment();

    const response = await axios.get(
      `https://api.nowpayments.io/v1/sub-partner?id=${req.body.adress}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return res.json({ count: response.data.count });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

//создать запрос на трансфер другому юзеру
app.post('/api/rqst_to_transfer', async (req, res) => {
  try {
    // //         coin,
    // //         sum,
    // //         tlgid,
    // //         adress,
    // //         ourComission,

    // найти nowPayment id по тлг id
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });

    if (!user) {
      return res.status(404).send('Пользователь не найден');
    }

    console.log('step 1', user);

    const fromUserNP = user._doc.nowpaymentid;

    let item_id = '';
    const qtyToTransfer = (
      Number(req.body.sum) - Number(req.body.ourComission)
    ).toFixed(6);

    const token = await getTokenFromNowPayment();

    //делаем перевод с счета клиента на мастер счет, это когда комиссия не равна 0
    if (req.body.ourComission != 0) {
      const requestData = {
        currency: String(req.body.coin),
        amount: Number(req.body.ourComission),
        sub_partner_id: String(fromUserNP),
      };

      const response = await axios.post(
        'https://api.nowpayments.io/v1/sub-partner/write-off',
        requestData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 секунд таймаут
        }
      );

      console.log('step 2', response.data);

      if (response.data.result.status === 'PROCESSING') {
        const transactionId_comission = response.data.result.id;

        const statusComission = 'new';
        const our_comission = req.body.ourComission;

        item_id = await createRqstTransferToOtherUserModel(
          transactionId_comission,
          req.body.coin,
          req.body.sum,
          fromUserNP,
          req.body.adress,
          our_comission,
          req.body.tlgid,
          statusComission,
          qtyToTransfer
        );

        console.log('step 4 ifNe0 RQST=', item_id);
      }

      //когда комиссия не равна 0 - перевод на мастер счет не делаем, просто создаем запись в БД
    } else if (req.body.ourComission == 0) {
      const transactionId_comission = 0;
      const statusComission = 'finished';
      const our_comission = 0;

      item_id = await createRqstTransferToOtherUserModel(
        transactionId_comission,
        req.body.coin,
        req.body.sum,
        fromUserNP,
        req.body.adress,
        our_comission,
        req.body.tlgid,
        statusComission,
        qtyToTransfer
      );

      console.log('step 4 if0 RQST=', item_id);
    }

    const requestData = {
      currency: String(req.body.coin),
      amount: Number(qtyToTransfer),
      from_id: String(fromUserNP),
      to_id: String(req.body.adress),
    };

    console.log('step 5 requestData=', requestData);

    const transferResponse = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/transfer',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    const transactionId_transferToUser = transferResponse.data.result.id;
    console.log('step 6 transef', transferResponse.data);

    //поменять инфо в БД
    const updatedItem = await RqstTransferToOtherUserModel.findOneAndUpdate(
      { _id: item_id.item_id },
      {
        $set: {
          transactionId_transferToUser: Number(transactionId_transferToUser),
          statusTransferToUser: 'new',
        },
      }
    );

    return res.json({ status: 'OK' });
  } catch {}
});

async function createRqstTransferToOtherUserModel(
  transactionId_comission,
  coin,
  sum,
  fromUserNP,
  adress,
  ourComission,
  tlgid,
  statusComission,
  qtyToTransfer
) {
  try {
    const rqst = new RqstTransferToOtherUserModel({
      transactionId_comission: transactionId_comission,
      coin: coin,
      totalSum: sum,
      fromUserNP: fromUserNP,
      toUserNP: adress,
      ourComission: ourComission,
      fromUserTlgid: tlgid,
      statusComission: statusComission,
      statusAll: 'new',
      transactionId_transferToUser: 0,
      statusTransferToUser: '0',
      qtyToTransfer: qtyToTransfer,
    });

    const item = await rqst.save();

    console.log('step 3 ITEM=', item._id);
    return { item_id: item._id.toString() };
  } catch (err) {
    console.log(err);
  }
}

app.get('/api/get_conversion_rate', async (req, res) => {
  try {
    const amount = Number(req.query.amount);
    const coinFrom = req.query.coinFrom;
    const coinTo = req.query.coinTo;

    const response = await axios.get(
      `https://api.nowpayments.io/v1/estimate?amount=${amount}&currency_from=${coinFrom}&currency_to=${coinTo}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    const convertedAmount = response.data.estimated_amount;

    return res.status(200).json({
      status: 'ok',
      convertedAmount: convertedAmount,
    });
  } catch (err) {
    console.error('Ошибка в /api/get_conversion_rate:', err);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
});

app.get('/api/get_minamount', async (req, res) => {
  try {
    const minAmount = await getMinAmountForDeposit(req.query.coinFrom);

    return res.status(200).json({
      status: 'ok',
      minAmount: minAmount,
    });
  } catch (err) {
    console.error('Ошибка в /api/get_minamount:', err);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
});

// получение баланса юзера в выбранной валюте, для отображения на вкладке обмена
app.get('/api/get_balance_currentCoin', async (req, res) => {
  try {
    const tlgid = req.query.tlgid;
    const coin = req.query.coin;

    const user = await UserModel.findOne({ tlgid: tlgid });
    // const valute = user.valute;

    if (user) {
      const nowpaymentid = user._doc.nowpaymentid;

      const response = await axios.get(
        `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,
        {
          headers: {
            'x-api-key': process.env.NOWPAYMENTSAPI,
          },
        }
      );

      
      const userBalance = response.data.result.balances;
      
      
      const arrayOfUserBalance = Object.entries(userBalance).map(
        ([key, value]) => ({
          currency: key, // кладем ключ внутрь объекта
          ...value, // распаковываем остальные свойства
        })
      );
      
      console.log('2 | userBalance',arrayOfUserBalance)
      
      arrayOfUserBalance.map((item) => {

        const epsilon = 1e-20
         

        if (item.currency === coin && Math.abs(item.amount - 2e-18) > epsilon) {
          return res.json({
            coin: coin,
            balance: item.amount,
          });
        }         
        
      });

      // если не найдено
      return res.json({
            coin: coin,
            balance: 0,
          });

      // return res.json({ arrayOfUserBalanceWithUsdPrice });
    } else {
      console.log('такого нет');
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});



//перевод с Юзер счета на Мастер счет для Обмена
app.post('/api/rqst_fromUser_toMaster', async (req, res) => {
  try {
    const token = await getTokenFromNowPayment();

    // найти nowPayment id по тлг id
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });

    if (!user) {
      return res.status(404).send('Пользователь не найден');
    }

    const nowpaymentid = user._doc.nowpaymentid;
    const language = user._doc.language;

    const requestData = {
      currency: String(req.body.coinFrom),
      amount: Number(req.body.amount),
      sub_partner_id: String(nowpaymentid),
    };

    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/write-off',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    if (response.data.result.status === 'PROCESSING') {
      const id_clientToMaster = response.data.result.id;

      // console.log('transactionId=', response.data.result);

      const createRqst = await createRqstExchange(
        id_clientToMaster,
        req.body.tlgid,
        nowpaymentid,
        req.body.amount,
        req.body.coinFrom,
        req.body.convertedAmount,
        req.body.coinTo,
        req.body.nowpaymentComission,
        req.body.ourComission,
        language
      );

      if (createRqst === 'created') {
        // console.log('createRqst=', createRqst);
        return res.json({ status: 'OK' });
      }
    }
  } catch (error) {
    console.error('Error in createRqstTrtFromuserToMain', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Error adress: ${error.message}`);
  }
});

async function createRqstExchange(
  id_clientToMaster,
  tlgid,
  nowpaymentid,
  amount,
  coinFrom,
  convertedAmount,
  coinTo,
  nowpaymentComission,
  ourComission,
  language
) {
  try {
    const rqst = new RqstExchangeSchemaModel({
      id_clientToMaster: id_clientToMaster,
      id_exchange: 0,
      id_masterToClient: 0,
      status: 'new',
      tlgid: tlgid,
      userNP: nowpaymentid,
      amountFrom: amount,
      coinFrom: coinFrom,
      amountTo: convertedAmount,
      coinTo: coinTo,
      nowpaymentComission: nowpaymentComission,
      ourComission: ourComission,
      language: language,
    });

    await rqst.save();
    return 'created';
  } catch (err) {
    console.log(err);
  }
}



app.listen(PORT, (err) => {
  if (err) {
    return console.log(err);
  }
  console.log('server has been started');
});

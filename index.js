const TelegramBot = require('node-telegram-bot-api');
const bittrex = require('node.bittrex.api');
const { MongoClient } = require('mongodb');

const MY_USER_ID = 1234567;
const TOKEN = '1234567';
const URI = '1234567';
const DONATE_TO = '1234567';

const bot = new TelegramBot(TOKEN, { polling: true });

const help = [
  '/help - call the police (joke!)',
  '/howto - show short tutorial as 3 screenshots of how to get your api keys',
  '/reg apiKey apiSecret - register keys pair to be able access to Bittrex balance',
  '/clear - remove your keys pair',
  '/keys - show your keys pair',
  '/balance - show your Bittrex balance',
  '/btc - show last USDT price for BTC',
  '/donate - show the BTC wallet where you can send your donations',
];

//
// ---------- MongoDB METHODS ----------
//

// connect to DB
let database;

MongoClient.connect(URI)
  .then((db) => { database = db.collection('users'); });

// Insert user with 2 keys into the database
const DBInsertUser = (userId, apiKey, apiSecret) =>
  database
    .insert({
      user: userId,
      apiKey,
      apiSecret,
    })
    .catch(err => Promise.reject(err));

// Remove user from DB by UserId (drop user keys - allowing him to register new keys)
const DBRemoveUser = userId =>
  database
    .deleteOne({ user: userId })
    .catch(err => Promise.reject(err));

// Return user keys or false if they weren't provided
const DBFindUser = userId =>
  database
    .find({ user: userId })
    .toArray()
    .catch(err => Promise.reject(err));

// Show how many users provided their keys
const DBUsersCount = () =>
  database
    .count()
    .catch(err => Promise.reject(err));

//
// ---------- LOGIC METHODS ----------
//

// Register new user by adding new user with 2 keys to users object
const registerUser = (userId, apiKey, apiSecret) => {
  // If keys are not valid - return error msg
  if (apiKey.length !== 32 || apiSecret.length !== 32) {
    return Promise.resolve('You provided invalid keys. Check their length to be 32 characters');
  }

  return DBFindUser(userId)
    .then((user) => {
      // If user already provided keys to DB - return error msg
      if (user.length === 1) {
        return 'You are already registered your keys\n\nSend /keys to show them\n\nOr /clear to remove them';
      }
      // If user isn't in DB - insert his keys into DB and return welcome msg
      return DBInsertUser(userId, apiKey, apiSecret)
        .then(() => 'Your keys accepted!\n\n/balance now available for you, enjoy');
    });
};

// Send private keys to user
const showKeys = userId =>
  DBFindUser(userId)
    .then((user) => {
      if (user.length === 1) {
        return {
          apiKey: user[0].apiKey,
          apiSecret: user[0].apiSecret,
        };
      }
      /* eslint-disable prefer-promise-reject-errors */
      return Promise.reject('No user in DB');
      /* eslint-enable prefer-promise-reject-errors */
    });

// Send a request to Bittrex for user balance and return an object
const getUserBalance = (apikey, apisecret) =>
  new Promise((resolve, reject) => {
    bittrex.options({
      apikey,
      apisecret,
    });

    bittrex.getbalances((data, err) => {
      if (err === null) {
        resolve(data.result);
      } else {
        reject(err.message);
      }
    });
  });

// Parse user balance object and return array of coin literals (['BCC', 'ETH', ...])
const balanceToCoinArray = balance =>
  balance
    .map(coin => coin.Currency)
    .filter(coin => coin !== 'BTC');

// Get last tick (price in BTC) of chosen coin
const getCoinToBTC = coin =>
  new Promise((resolve, reject) =>
    bittrex.sendCustomRequest(`https://bittrex.com/api/v1.1/public/getticker?market=BTC-${coin}`, (data, err) => {
      if (err === null) {
        resolve(data.result.Last);
      } else {
        reject(err);
      }
    }));

// Get last USDT-BTC price
const getUSDTforBTC = () =>
  new Promise((resolve, reject) =>
    bittrex.sendCustomRequest('https://bittrex.com/api/v1.1/public/getticker?market=USDT-BTC', (data, err) => {
      if (err == null) {
        resolve(data.result.Last);
      } else {
        reject(err);
      }
    }));

// Altcoin balance to BTC value
const coinValueToBTC = (coins, rate) =>
  Number((coins * rate).toFixed(4));

// Magic!
const parseBalance = (balance) => {
  const filteredBalance = balance.filter(coin => coin.Balance !== 0);

  const coins = balanceToCoinArray(filteredBalance);
  const coinsRate = coins.map(coin => getCoinToBTC(coin));

  return getUSDTforBTC()
    .then(BTCrate =>
      Promise.all(coinsRate)
        .then(rates =>
          rates
            .reduce((acc, rate, index) => {
              acc[coins[index]] = rate;
              return acc;
            }, {}))
        .then((coinsToBTC) => {
          const rates = coinsToBTC;
          rates.BTC = 1;

          const summaryBTC = filteredBalance
            .reduce((acc, coin) => {
              const currency = coin.Currency;
              const amount = coin.Balance;
              return acc + coinValueToBTC(amount, rates[currency]);
            }, 0);

          const summaryUSDT = summaryBTC * BTCrate;

          const coinsBalances = filteredBalance
            .map((coin) => {
              const currency = coin.Currency;
              const amount = coin.Balance;
              const amountBTC = coinValueToBTC(amount, rates[currency]);
              const amountUSDT = (BTCrate * amountBTC).toFixed(2);

              return `${currency}: ${amount}\n${amountBTC} BTC\n${amountUSDT} USDT`;
            })
            .join('\n\n');

          return `${coinsBalances}\n\nTotal:\n${summaryBTC.toFixed(4)} BTC\n${summaryUSDT.toFixed(2)} USDT`;
        }));
};

const sendError = userId => err =>
  bot.sendMessage(
    userId,
    `Sometheing went wrong - ${err}`,
  );

const sendResponse = userId => response =>
  bot.sendMessage(
    userId,
    response,
  );

//
// ---------- BOT COMMANDS ----------
//

// /start
bot.onText(/\/start/, msg => sendResponse(msg.from.id)('Hello, buddy!\nUse /help and enjoy'));

// /help
bot.onText(/\/help/, msg => sendResponse(msg.from.id)(help.join('\n')));

// /reg
bot.onText(/\/reg (.+) (.+)/, (msg, match) => {
  const userId = msg.from.id;

  registerUser(userId, String(match[1]), String(match[2]))
    .then(sendResponse(userId))
    .catch(sendError(userId));
});

// /me
bot.onText(/\/me/, msg => sendResponse(msg.from.id)(msg.from.id));

// /users
bot.onText(/\/users/, (msg) => {
  const userId = msg.from.id;

  if (userId === MY_USER_ID) {
    DBUsersCount()
      .then(count => sendResponse(userId)(`Total users: ${count}`))
      .catch(sendError(userId));
  }
});

// /keys
bot.onText(/\/keys/, (msg) => {
  const userId = msg.from.id;

  showKeys(userId)
    .then((userObject) => {
      if (userObject.apiKey && userObject.apiSecret) {
        sendResponse(userId)(`Your apiKey: ${userObject.apiKey}\n\nYour apiSecret: ${userObject.apiSecret}`);
      }
    })
    .catch((err) => {
      if (err === 'No user in DB') {
        sendResponse(userId)('You should register your keys first!\n\n/howto may be helpful');
      } else {
        sendError(userId)(err);
      }
    });
});

// /balance
bot.onText(/\/balance/, (msg) => {
  const userId = msg.from.id;

  showKeys(userId)
    .then(userObject =>
      getUserBalance(userObject.apiKey, userObject.apiSecret)
        .then(messyBalance => parseBalance(messyBalance))
        .then(sendResponse(userId)))
    .catch((err) => {
      if (err === 'No user in DB') {
        sendResponse(userId)('You should register your keys first!\n\n/howto may be helpful');
      } else {
        sendError(userId)(err);
      }
    });
});

// /btc
bot.onText(/\/btc/, (msg) => {
  const userId = msg.from.id;

  getUSDTforBTC()
    .then(result => sendResponse(userId)(`1 BTC = ${result} USDT`))
    .catch(sendError(userId));
});

// /clear
bot.onText(/\/clear/, (msg) => {
  const userId = msg.from.id;

  DBFindUser(userId)
    .then((user) => {
      if (user.length === 1) {
        DBRemoveUser(userId)
          .then(() => sendResponse(userId)('Your keys were successfully removed'))
          .catch(sendError(userId));
      } else {
        sendResponse(userId)('You are not registered your keys yet');
      }
    });
});

// /howto
bot.onText(/\/howto/, (msg) => {
  const userId = msg.from.id;

  const step1 = 'data/2fa.png';
  const step2 = 'data/keys.png';
  const step3 = 'data/reg.png';

  bot.sendPhoto(userId, step1);
  setTimeout(() => bot.sendPhoto(userId, step2), 200);
  setTimeout(() => bot.sendPhoto(userId, step3), 400);
});

// /donate
bot.onText(/\/donate/, msg => sendResponse(msg.from.id)(DONATE_TO));

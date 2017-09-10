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
const DBConnect = (uri = URI) =>
  MongoClient.connect(uri);

// Insert user with 2 keys into the database
const DBInsertUser = (userId, apiKey, apiSecret) =>
  DBConnect()
    .then(database =>
      database.collection('users')
        .insert({
          user: userId,
          apiKey,
          apiSecret,
        })
        .then(() => database.close())
        .catch((err) => {
          database.close();
          Promise.reject(err);
        }))
    .catch(err => Promise.reject(err));

// Remove user from DB by UserId (drop user keys - allowing him to register new keys)
const DBRemoveUser = userId =>
  DBConnect()
    .then(database =>
      database.collection('users')
        .deleteOne({ user: userId })
        .then(() => database.close())
        .catch((err) => {
          database.close();
          Promise.reject(err);
        }))
    .catch(err => Promise.reject(err));

// Return user keys or false if they weren't provided
const DBFindUser = userId =>
  DBConnect()
    .then(database =>
      database.collection('users')
        .find({ user: userId })
        .toArray()
        .then((user) => {
          database.close();
          return user;
        })
        .catch((err) => {
          database.close();
          Promise.reject(err);
        }))
    .catch(err => Promise.reject(err));

// Show how many users provided their keys
const DBUsersCount = () =>
  DBConnect()
    .then(database =>
      database.collection('users')
        .count()
        .then((count) => {
          database.close();
          return count;
        })
        .catch((err) => {
          database.close();
          Promise.reject(err);
        }))
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
        .then(() => 'Your keys accepted!\n\n/balance now available for you, enjoy')
        .catch(err => Promise.reject(err));
    })
    .catch(err => Promise.reject(err));
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

      return {};
    })
    .catch(err => Promise.reject(err));

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
        reject(err);
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
  new Promise((resolve, reject) => {
    const url = 'https://bittrex.com/api/v1.1/public/getticker?market=USDT-BTC';

    bittrex.sendCustomRequest(url, (data, err) => {
      if (err == null) {
        resolve(data.result.Last);
      } else {
        reject(err);
      }
    });
  });

// Magic!
const parseBalance = (balance) => {
  const coins = balanceToCoinArray(balance);
  const coinsRate = coins.map(coin => getCoinToBTC(coin));

  return getUSDTforBTC()
    .then(BTCrate =>
      Promise.all(coinsRate)
        .then(rates =>
          rates
            .reduce((acc, rate, index) => {
              acc[`${coins[index]}`] = rate;
              return acc;
            }, {}))
        .then((coinsToBTC) => {
          const coinsRateToBTC = coinsToBTC;
          coinsRateToBTC.BTC = 1;

          const summaryBTC = balance
            .reduce((acc, coin) => {
              if (coin.Balance !== 0) {
                return acc + +(coin.Balance * coinsRateToBTC[coin.Currency]).toFixed(4);
              }
              return acc;
            }, 0);

          const summaryUSDT = balance
            .reduce((acc, coin) => {
              if (coin.Balance !== 0) {
                const amountBTC = (coin.Balance * coinsRateToBTC[coin.Currency]).toFixed(4);
                return acc + +(BTCrate * amountBTC).toFixed(2);
              }
              return acc;
            }, 0);

          const coinsBalances = balance
            .filter(coin => coin.Balance !== 0)
            .map((coin) => {
              const currency = coin.Currency;
              const amount = coin.Balance;
              const amountBTC = (coin.Balance * coinsRateToBTC[coin.Currency]).toFixed(4);
              const amountUSDT = (BTCrate * amountBTC).toFixed(2);

              return `${currency}: ${amount}\n${amountBTC} BTC\n${amountUSDT} USDT`;
            })
            .join('\n\n');

          return `${coinsBalances}\n\nTotal:\n${summaryBTC.toFixed(4)} BTC\n${summaryUSDT.toFixed(2)} USDT`;
        })
        .catch(err => Promise.reject(err)))
    .catch(err => Promise.reject(err));
};

//
// ---------- BOT COMMANDS ----------
//

// /start
bot.onText(/\/start/, msg =>
  bot.sendMessage(
    msg.from.id,
    'Hello, buddy!\nUse /help and enjoy',
  ));

// /help
bot.onText(/\/help/, msg =>
  bot.sendMessage(
    msg.from.id,
    help.join('\n'),
  ));

// /reg
bot.onText(/\/reg (.+) (.+)/, (msg, match) =>
  registerUser(String(msg.from.id), String(match[1]), String(match[2]))
    .then(response =>
      bot.sendMessage(
        msg.from.id,
        response,
      ))
    .catch(err =>
      bot.sendMessage(
        msg.from.id,
        `Sometheing went wrong - ${err}`,
      )));

// /me
bot.onText(/\/me/, msg =>
  bot.sendMessage(
    msg.from.id,
    msg.from.id,
  ));

// /users
bot.onText(/\/users/, (msg) => {
  if (msg.from.id === MY_USER_ID) {
    DBUsersCount()
      .then(count =>
        bot.sendMessage(
          msg.from.id,
          `Total users: ${count}`,
        ))
      .catch(err =>
        bot.sendMessage(
          msg.from.id,
          `Sometheing went wrong - ${err}`,
        ));
  }
});

// /keys
bot.onText(/\/keys/, msg =>
  showKeys(String(msg.from.id))
    .then((userObject) => {
      if (userObject.apiKey && userObject.apiSecret) {
        bot.sendMessage(
          msg.from.id,
          `Your apiKey: ${userObject.apiKey}\n\nYour apiSecret: ${userObject.apiSecret}`,
        );
      } else {
        bot.sendMessage(
          msg.from.id,
          'You should register your keys first!\n\n/howto may be helpful',
        );
      }
    })
    .catch(err =>
      bot.sendMessage(
        msg.from.id,
        `Sometheing went wrong - ${err}`,
      )));

// /balance
bot.onText(/\/balance/, (msg) => {
  const userId = msg.from.id;

  showKeys(String(userId))
    .then((userObject) => {
      if (userObject.apiKey && userObject.apiSecret) {
        getUserBalance(userObject.apiKey, userObject.apiSecret)
          .then(messyBalance =>
            parseBalance(messyBalance)
              .then(parsedBalance =>
                bot.sendMessage(
                  userId,
                  parsedBalance,
                ))
              .catch(err =>
                bot.sendMessage(
                  userId,
                  `Sometheing went wrong - ${err}`,
                )))
          .catch(err =>
            bot.sendMessage(
              userId,
              `Sometheing went wrong - ${err}`,
            ));
      } else {
        bot.sendMessage(
          userId,
          'You should register your keys first!\n\n/howto may be helpful',
        );
      }
    })
    .catch(err =>
      bot.sendMessage(
        userId,
        `Sometheing went wrong - ${err}`,
      ));
});

// /btc
bot.onText(/\/btc/, msg =>
  getUSDTforBTC()
    .then(result =>
      bot.sendMessage(
        msg.from.id,
        `1 BTC = ${result} USDT`,
      ))
    .catch(err =>
      bot.sendMessage(
        msg.from.id,
        `Sometheing went wrong - ${err}`,
      )));

// /clear
bot.onText(/\/clear/, msg =>
  DBRemoveUser(String(msg.from.id))
    .then(() =>
      bot.sendMessage(
        msg.from.id,
        'Your keys were successfully removed',
      ))
    .catch(err =>
      bot.sendMessage(
        msg.from.id,
        `Sometheing went wrong - ${err}`,
      )));

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
bot.onText(/\/donate/, msg =>
  bot.sendMessage(
    msg.from.id,
    DONATE_TO,
  ));

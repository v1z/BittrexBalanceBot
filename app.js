const TelegramBot = require('node-telegram-bot-api');
const Database = require('./db');
const Bittrex = require('./bittrex');

const { config } = require('./config');

const TOKEN = config.required.botToken;
const MY_USER_ID = config.optional.telegramUserID;
const DONATE_TO = config.optional.donations;

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

const sendResponse = userId => response =>
  bot.sendMessage(
    userId,
    response,
    {
      reply_markup: {
        keyboard: [
          ['/balance', '/help'],
        ],
        resize_keyboard: true,
      },
    },
  );

const sendError = userId => err =>
  sendResponse(userId)(`Sometheing went wrong - ${err}`);

// /start
bot.onText(/\/start/, msg => sendResponse(msg.from.id)('Hello, buddy!\nUse /help and enjoy'));

// /help
bot.onText(/\/help/, msg => sendResponse(msg.from.id)(help.join('\n')));

// /reg
bot.onText(/\/reg (.+) (.+)/, (msg, match) => {
  const userId = msg.from.id;

  Database.registerUser(userId, String(match[1]), String(match[2]))
    .then(sendResponse(userId))
    .catch(sendError(userId));
});

// /me
bot.onText(/\/me/, msg => sendResponse(msg.from.id)(msg.from.id));

// /users
bot.onText(/\/users/, (msg) => {
  const userId = msg.from.id;

  if (userId === MY_USER_ID) {
    Database.usersCount()
      .then(count => sendResponse(userId)(`Total users: ${count}`))
      .catch(sendError(userId));
  }
});


const handleNoUserInDBError = userId => (err) => {
  if (err === 'No user in DB') {
    sendResponse(userId)('You should register your keys first!\n\n/howto may be helpful');
  } else {
    sendError(userId)(err);
  }
};

// /keys
bot.onText(/\/keys/, (msg) => {
  const userId = msg.from.id;

  Database.showKeys(userId)
    .then((userObject) => {
      if (userObject.apiKey && userObject.apiSecret) {
        sendResponse(userId)(`Your apiKey: ${userObject.apiKey}\n\nYour apiSecret: ${userObject.apiSecret}`);
      }
    })
    .catch(handleNoUserInDBError(userId));
});

// /balance
bot.onText(/\/balance/, (msg) => {
  const userId = msg.from.id;

  Database.showKeys(userId)
    .then(userObject =>
      Bittrex.getUserBalance(userObject.apiKey, userObject.apiSecret)
        .then(sendResponse(userId)))
    .catch(handleNoUserInDBError(userId));
});

// /btc
bot.onText(/\/btc/, (msg) => {
  const userId = msg.from.id;

  Bittrex.getUSDTforBTC()
    .then(result => sendResponse(userId)(`1 BTC = ${result} USDT`))
    .catch(sendError(userId));
});

// /clear
bot.onText(/\/clear/, (msg) => {
  const userId = msg.from.id;

  Database.findUser(userId)
    .then((user) => {
      if (user.length === 1) {
        Database.removeUser(userId)
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

  const step1 = 'images/2fa.png';
  const step2 = 'images/keys.png';
  const step3 = 'images/reg.png';

  bot.sendPhoto(userId, step1);
  setTimeout(() => bot.sendPhoto(userId, step2), 200);
  setTimeout(() => bot.sendPhoto(userId, step3), 400);
});

// /donate
bot.onText(/\/donate/, msg =>
  DONATE_TO.map(way => sendResponse(msg.from.id)(`${way.coin}\n${way.wallet}`)));

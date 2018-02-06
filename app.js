const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database/database');
const Bittrex = require('./bittrex/bittrex');

const { config } = require('./config');

const {
  required: { botToken: TOKEN },
  optional: { telegramUserID: MY_USER_ID, donations: DONATE_TO },
} = config;

const bot = new TelegramBot(TOKEN, { polling: true });

const help = [
  '/help - call the police (joke!)',
  '/howto - show short tutorial as 3 screenshots of how to get your api keys',
  '/reg apiKey apiSecret - register keys pair to be able access to Bittrex balance',
  '/clear - remove your keys pair',
  '/keys - show your keys pair',
  '/balance - show your Bittrex balance',
  '/btc - show last USDT price for BTC',
  '/donate - show wallets where you can send your donations',
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

const handleNoUserInDBError = userId => err => (
  err === 'No user in DB'
    ? sendResponse(userId)('You should register your keys first!\n\n/howto may be helpful')
    : sendError(userId)(err));

bot.on('message', ({ from: { id: userId }, text }) => {
  const [cmd, arg1, arg2] = text.split(' '); // args need for user registration case

  switch (cmd) {
    case '/start':
      sendResponse(userId)('Hello, buddy!\nUse /help and enjoy');
      break;

    default:
    case '/help':
      sendResponse(userId)(help.join('\n'));
      break;

    case '/howto':
      {
        const step1 = 'images/2fa.png';
        const step2 = 'images/keys.png';
        const step3 = 'images/reg.png';

        bot.sendPhoto(userId, step1);
        setTimeout(() => bot.sendPhoto(userId, step2), 200);
        setTimeout(() => bot.sendPhoto(userId, step3), 400);
      }
      break;

    case '/reg':
      Database.registerUser(userId, String(arg1), String(arg2))
        .then(sendResponse(userId))
        .catch(sendError(userId));
      break;

    case '/clear':
      Database.findUser(userId)
        .then(({ length }) => (
          length === 1
            ? Database.removeUser(userId)
              .then(sendResponse(userId)('Your keys were successfully removed'))
              .catch(sendError(userId))
            : sendResponse(userId)('You are not registered your keys yet')));
      break;

    case '/keys':
      Database.showKeys(userId)
        .then(({ apiKey, apiSecret }) => {
          if (apiKey && apiSecret) {
            sendResponse(userId)(`Your apiKey: ${apiKey}\n\nYour apiSecret: ${apiSecret}`);
          }
        })
        .catch(handleNoUserInDBError(userId));
      break;

    case '/balance':
      Database.showKeys(userId)
        .then(({ apiKey, apiSecret }) =>
          Bittrex.getUserBalance(apiKey, apiSecret)
            .then(sendResponse(userId)))
        .catch(handleNoUserInDBError(userId));
      break;

    case '/btc':
      Bittrex.getUSDTforBTC()
        .then(value => sendResponse(userId)(`1 BTC = ${value} USDT`))
        .catch(sendError(userId));
      break;

    case '/donate':
      DONATE_TO.map(({ coin, wallet }) => sendResponse(userId)(`${coin}\n${wallet}`));
      break;

    case '/users':
      if (userId === MY_USER_ID) {
        Database.usersCount()
          .then(count => sendResponse(userId)(`Total users: ${count}`))
          .catch(sendError(userId));
      }
      break;

    case '/me':
      sendResponse(userId)(userId);
      break;
  }
});

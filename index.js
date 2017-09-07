const TelegramBot = require('node-telegram-bot-api')
const bittrex = require('node.bittrex.api')
const MongoClient = require('mongodb').MongoClient
const assert = require('assert')

const MY_USER_ID = 1234567
const TOKEN = '1234567'
const URI = "1234567"
const DONATE_TO = '1234567'

const bot = new TelegramBot(TOKEN, {polling: true})

const help = [
  '/help - call the police (joke!)',
  '/howto - show short tutorial as 3 screenshots of how to get your api keys',
  '/reg apiKey apiSecret - register keys pair to be able access to Bittrex balance',
  '/clear - remove your keys pair',
  '/keys - show your keys pair',
  '/balance - show your Bittrex balance',
  '/btc - show last USDT price for BTC',
  '/donate - show the BTC wallet where you can send your donations'
]

//
// ---------- MongoDB METHODS ----------
//

// connect to DB
const DB_connect = (uri = URI) =>
  MongoClient.connect(uri)

// Insert user with 2 keys into the database
const DB_insertUser = (userId, apiKey, apiSecret) =>
  new Promise((resolve, reject) =>
    DB_connect()
      .then(database =>
        database.collection('users')
          .insert({
            user: userId,
            apiKey: apiKey,
            apiSecret: apiSecret
          })
            .then(() => {
              database.close()
              resolve()
            })
            .catch(err => {
              database.close()
              reject(err)
            })
      )
      .catch(err => reject(err))
  )

// Remove user from DB by UserId (drop user keys - allowing him to register new keys)
const DB_removeUser = userId =>
  new Promise((resolve, reject) =>
    DB_connect()
      .then(database =>
        database.collection('users')
          .deleteOne({user: userId})
            .then(() => {
              database.close()
              resolve()
            })
            .catch(err => {
              database.close()
              reject(err)
            })
      )
      .catch(err => reject(err))
  )

// Return user keys or false if they weren't provided
const DB_findUser = userId =>
  new Promise((resolve, reject) =>
    DB_connect()
      .then(database =>
        database.collection('users')
          .find({user: userId})
          .toArray()
            .then(user => {
              database.close()
              resolve(user)
            })
            .catch(err => {
              database.close()
              reject(err)
            })
      )
      .catch(err => reject(err))
  )

// Show how many users provided their keys
const DB_usersCount = () =>
  new Promise((resolve, reject) =>
    DB_connect()
      .then(database =>
        database.collection('users')
          .count()
          .then(count => {
            database.close()
            resolve(count)
          })
          .catch(err => {
            database.close()
            reject(err)
          })
      )
      .catch(err => reject(err))
  )

//
// ---------- LOGIC METHODS ----------
//

// Register new user by adding new user with 2 keys to users object
const registerUser = (userId, apiKey, apiSecret) =>
    new Promise((resolve, reject) => {
      let response = 'Sometheing go wrong, try again later'

      // If user already provided keys to DB - change response msg
      DB_findUser()
        .then(user => {
          if (user.length == 1)
            response = 'You are already registered your keys\n\nSend /keys to show them\n\nOr /clear to remove them'
        })
        .then(() => {
          // If user isn't in DB - insert his keys
          // If keys is not valid - change response msg
          if (apiKey.length == 32 && apiSecret.length == 32 && response == 'Sometheing go wrong, try again later') {
            DB_insertUser(userId, apiKey, apiSecret)
              .then(() => {
                resolve('Your keys accepted!\n\n/balance now available for you, enjoy')
              })
              .catch(err => reject(err))
          } else if (apiKey.length != 32 || apiSecret.length != 32) {
            resolve('You provided invalid keys. Check their length to be 32 characters')
          } else {
            resolve(response)
          }
        })
    })

// Send private keys to user
const showKeys = userId =>
  DB_findUser(userId)
    .then(user => {
      if (user.length == 1)
        return({
          apiKey: user[0].apiKey,
          apiSecret: user[0].apiSecret
        })
      else
        return({})
    })
    .catch(err => `Sometheing went wrong - ${err}`)

// Send a request to Bittrex for user balance and return an object
const getUserBalance = (apiKey, apiSecret) =>
  new Promise((resolve, reject) => {
    bittrex.options({
      'apikey' : apiKey,
      'apisecret' : apiSecret
    })

    bittrex.getbalances((data, err) => {
      if (err === null)
        resolve(data.result)
      else
        reject(err)
    })
  })

// All the magic is here!
const parseBalance = balance =>
  new Promise((resolve, reject) => {
    const coins = balanceToCoinArray(balance)
    const coinsRate = coins.map(coin => getCoinToBTC(coin))

    getUSDTforBTC()
      .then(BTCrate => {
        Promise.all(coinsRate)
          .then(rates =>
            rates
              .reduce((acc, rate, index) => {
                acc[`${coins[index]}`] = rate
                return acc
              }, {})
          )
          .then(coinsToBTC => {
            coinsToBTC['BTC'] = 1

            let summaryBTC = 0
            let summaryUSDT = 0

            const coinsBalances = balance.reduce((acc, coin) => {
              if (coin.Balance != 0) {
                const currency = coin.Currency
                const amount = coin.Balance
                const amountBTC = (coin.Balance * coinsToBTC[coin.Currency]).toFixed(4)
                const amountUSDT = (BTCrate * amountBTC).toFixed(2)

                summaryBTC += +amountBTC
                summaryUSDT += +amountUSDT

                return acc += `${currency}: ${amount}\n${amountBTC} BTC\n${amountUSDT} USDT\n\n`
              } else return acc
            }, '')

            resolve(coinsBalances + `Total:\n${summaryBTC.toFixed(4)} BTC\n${summaryUSDT.toFixed(2)} USDT`)
          })
          .catch(err => reject(err))
      })
      .catch(err => reject(err))
  })

// Parse user balance object and return array of coin literals (['BCC', 'ETH', ...])
const balanceToCoinArray = balance =>
  balance
    .map(coin => coin.Currency)
    .filter(coin => coin != 'BTC')

// Get last tick (price in BTC) of chosen coin
const getCoinToBTC = coin =>
  new Promise(resolve => {
    const url = `https://bittrex.com/api/v1.1/public/getticker?market=BTC-${coin}`

    bittrex.sendCustomRequest(url, (data, err) => {
      resolve(data.result.Last)
    })
  })

// Get last USDT-BTC price
const getUSDTforBTC = () =>
  new Promise((resolve, reject) => {
    const url = `https://bittrex.com/api/v1.1/public/getticker?market=USDT-BTC`

    bittrex.sendCustomRequest(url, (data, err) => {
      if (err == null)
        resolve(data.result.Last)
      else
        reject(err)
    })
  })

//
// ---------- BOT COMMANDS ----------
//

// /start
bot.onText(/\/start/, msg => {
  bot.sendMessage(
    msg.from.id,
    'Hello, buddy!\nUse /help and enjoy'
  )
})

// /help
bot.onText(/\/help/, msg => {
  bot.sendMessage(
    msg.from.id,
    help.map(command => `${command}\n`).join('')
  )
})

// /reg
bot.onText(/\/reg (.+) (.+)/, (msg, match) =>
  registerUser(String(msg.from.id), String(match[1]), String(match[2]))
    .then(response =>
      bot.sendMessage(
        msg.from.id,
        response
      )
    )
    .catch(err =>
      bot.sendMessage(
        msg.from.id,
        `Sometheing went wrong - ${err}`
      )
    )
)

// /me
bot.onText(/\/me/, msg =>
  bot.sendMessage(
    msg.from.id,
    msg.from.id
  )
)

// /users
bot.onText(/\/users/, msg => {
  if (msg.from.id == MY_USER_ID)
    DB_usersCount()
      .then(count =>
        bot.sendMessage(
          msg.from.id,
          `Total users: ${count}`
        )
      )
      .catch(err =>
        bot.sendMessage(
          msg.from.id,
          `Sometheing went wrong - ${err}`
        )
      )
})

// /keys
bot.onText(/\/keys/, msg =>
  showKeys(String(msg.from.id))
    .then(response => {
      if (typeof response == 'string')
        bot.sendMessage(
          msg.from.id,
          response
        )
      else if (response.apiKey && response.apiSecret)
        bot.sendMessage(
          msg.from.id,
          `Your apiKey: ${response.apiKey}\n\nYour apiSecret: ${response.apiSecret}`
        )
      else
        bot.sendMessage(
          msg.from.id,
          'You should register your keys first!\n\n/howto may be helpful'
        )
    })
)

// /balance
bot.onText(/\/balance/, msg => {
  const userId = msg.from.id

  showKeys(String(userId))
    .then(response => {
      if (typeof response == 'string')
        bot.sendMessage(
          userId,
          response
        )
      else if (response.apiKey && response.apiSecret)
        getUserBalance(response.apiKey, response.apiSecret)
          .then(messyBalance =>
            parseBalance(messyBalance)
              .then(parsedBalance =>
                bot.sendMessage(
                  userId,
                  parsedBalance
                )
              )
              .catch(err =>
                bot.sendMessage(
                  userId,
                  `Sometheing went wrong - ${err}`
                )
              )
          )
          .catch(err =>
            bot.sendMessage(
              userId,
              `Sometheing went wrong - ${err}`
            )
          )
      else
        bot.sendMessage(
          userId,
          'You should register your keys first!\n\n/howto may be helpful'
        )
    })
})

// /btc
bot.onText(/\/btc/, msg =>
  getUSDTforBTC()
    .then(result =>
      bot.sendMessage(
        msg.from.id,
        `1 BTC = ${result} USDT`
      )
    )
    .catch(err =>
      bot.sendMessage(
        msg.from.id,
        `Sometheing went wrong - ${err}`
      )
    )
)

// /clear
bot.onText(/\/clear/, msg =>
  DB_removeUser(String(msg.from.id))
    .then(() =>
      bot.sendMessage(
        msg.from.id,
        'Your keys were successfully removed'
      )
    )
    .catch(err =>
      bot.sendMessage(
        msg.from.id,
        `Sometheing went wrong - ${err}`
      )
    )
)

// /howto
bot.onText(/\/howto/, msg => {
  const userId = msg.from.id
  const step1 = 'data/2fa.png'
  const step2 = 'data/keys.png'
  const step3 = 'data/reg.png'

  bot.sendPhoto(userId, step1)
  setTimeout(() => bot.sendPhoto(userId, step2), 200)
  setTimeout(() => bot.sendPhoto(userId, step3), 400)
})

// /donate
bot.onText(/\/donate/, msg =>
  bot.sendMessage(
    msg.from.id,
    DONATE_TO
  )
)

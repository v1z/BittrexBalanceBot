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
  new Promise((resolve, reject) => {
    MongoClient.connect(uri)
      .then(database => resolve(database))
      .catch(err => reject(err))
  })

// Insert user with 2 keys into the database
const DB_insertUser = (user, apiKey, apiSecret, database) =>
  new Promise((resolve, reject) => {
    database.collection('users')
      .insert({
        user: user,
        apiKey: apiKey,
        apiSecret: apiSecret
      }, (err, result) => {
        err === null
          ? resolve()
          : reject(err)
      })
  })

// Remove user from DB by UserId (drop user keys - allowing him to register new keys)
const DB_removeUser = (userId, database) =>
  new Promise((resolve, reject) => {
    database.collection('users')
      .deleteOne({user: userId}, (err, result) => {
        err === null
          ? resolve()
          : reject(err)
      })
  })

// Try to find user in database by userId and return true/false
const DB_isUserInDB = (userId, database) =>
  new Promise(resolve => {
    database.collection('users')
      .find({user: userId})
      .toArray((err, users) => {
        err === null
          ? resolve(users.length == 1)
          : reject(err)
      })
  })

// Return user keys or false if they weren't provided
const DB_getUserKeys = (userId, database) =>
  new Promise(resolve => {
    database.collection('users')
      .find({user: userId})
      .toArray((err, user) => {
        err === null
          ? resolve(user)
          : reject(err)
      })
  })

//
// ---------- LOGIC METHODS ----------
//

// Show how many users provide their keys
const getUsersCount = database =>
  new Promise((resolve, reject) => {
    database.collection('users')
      .find({})
      .toArray((err, users) => {
        err === null
          ? resolve(users.length)
          : reject(err)
      })
  })

// Register new user by adding new user with 2 keys to users object
const registerUser = (user, apiKey, apiSecret) =>
    new Promise(resolve => {
      let response = 'Sometheing go wrong, try again later'

      // If user already provided keys to DB - change response msg
      DB_connect()
        .then(database => {
          DB_isUserInDB(user, database)
            .then(isUserInDB => {
              database.close()

              if (isUserInDB)
                response = 'You are already registered your keys\n\nSend /keys to show them\n\nOr /clear to remove them'
            })
        })
        .then(() => {
          // If user isn't in DB - insert his keys
          // If keys is not valid - change response msg
          if (apiKey.length == 32 && apiSecret.length == 32 && response == 'Sometheing go wrong, try again later') {
            DB_connect()
              .then(database => {
                DB_insertUser(user, apiKey, apiSecret, database)
                  .then(() => {
                    database.close()

                    resolve('Your keys accepted!\n\n/balance now available for you, enjoy')
                  })
              })
          } else if (apiKey.length != 32 || apiSecret.length != 32) {
            resolve('You provided invalid keys. Check their length to be 32 characters')
          } else {
            resolve(response)
          }
        })
    })

// Send private keys to user
const showKeys = user =>
  new Promise(resolve => {
    DB_connect()
      .then(database => {
        DB_isUserInDB(user, database)
          .then(isUserInDB => {
            database.close()

            return isUserInDB
          })
          .then(isUserInDB => {
            if (isUserInDB) {
              DB_connect()
                .then(database => {
                  DB_getUserKeys(user, database)
                    .then(result => {
                      database.close()

                      resolve({
                        apiKey: result[0].apiKey,
                        apiSecret: result[0].apiSecret
                      })
                    })
                })
            } else {
                resolve({})
              }
          })
      })
  })

// Delete user's keys from users object
const removeKeys = user =>
  new Promise(resolve => {
    DB_connect()
      .then(database => {
        DB_removeUser(user, database)
          .then(() => {
            database.close()

            resolve()
          })
      })
    })

// Send a request to Bittrex for user balance and return an object
const getUserBalance = (apiKey, apiSecret) => {
  bittrex.options({
    'apikey' : apiKey,
    'apisecret' : apiSecret
  })

  return new Promise(resolve => {
    bittrex.getbalances((data, err ) => {
      resolve(data.result)
    })
  })
}

// All the magic is here!
const parseBalance = data =>
  new Promise(resolve => {
    const coins = getCoinsArray(data)
    const coinsRate = coins.map(coin => getCoinToBTC(coin))

    let coinsToBTC = {"BTC": 1}

    getUSDTforBTC()
      .then((BTCrate) => {
        Promise.all(coinsRate)
          .then(rates => rates.map((rate, index) => {
            coinsToBTC[`${coins[index]}`] = rate
          }))
          .then(() => {
            let summaryBTC = 0
            let summaryUSDT = 0

            const coinsBalances = data.reduce((acc, coin) => {
              if (coin.Balance != 0) {
                const currency = coin.Currency
                const amount = coin.Balance
                const amountBTC = (coin.Balance * coinsToBTC[coin.Currency]).toFixed(4)
                const amountUSDT = (BTCrate * amountBTC).toFixed(2)

                summaryBTC += +amountBTC
                summaryUSDT += +amountUSDT

                return acc += `${currency}: ${amount}\n${amountBTC} BTC\n${amountUSDT} USDT\n\n`
              } else {
                return acc
              }
            }, '')

            return coinsBalances + `Total:\n${summaryBTC.toFixed(4)} BTC\n${summaryUSDT.toFixed(2)} USDT`
          })
          .then(parsedBalance => resolve(parsedBalance))
      })
  })


// Parse user balance object and return array of coin literals (['BCC', 'ETH', ...])
const getCoinsArray = data =>
  data.reduce((acc, coin) => {
    if (coin.Currency != 'BTC')
      acc.push(coin.Currency)
    return acc
  }, [])

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
  new Promise(resolve => {
    const url = `https://bittrex.com/api/v1.1/public/getticker?market=USDT-BTC`

    bittrex.sendCustomRequest(url, (data, err) => {
      resolve(data.result.Last)
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
bot.onText(/\/reg (.+) (.+)/, (msg, match) => {
  registerUser(String(msg.from.id), String(match[1]), String(match[2]))
    .then(response =>
      bot.sendMessage(
        msg.from.id,
        response
      )
    )
})

// /me
bot.onText(/\/me/, msg => {
  bot.sendMessage(
    msg.from.id,
    msg.from.id
  )
})

// /users
bot.onText(/\/users/, msg => {
  if (msg.from.id == MY_USER_ID) {
    DB_connect()
      .then(database => {
        getUsersCount(database)
          .then(result => {
            database.close()

            bot.sendMessage(
              msg.from.id,
              `Total users: ${result}`
            )
          })
      })
  }
})

// /keys
bot.onText(/\/keys/, msg => {
  showKeys(String(msg.from.id))
    .then(keys => {
      if (keys.apiKey && keys.apiSecret) {
        bot.sendMessage(
          msg.from.id,
          `Your apiKey: ${keys.apiKey}\n\nYour apiSecret: ${keys.apiSecret}`
        )
      } else {
        bot.sendMessage(
          msg.from.id,
          'You should register your keys first!\n\n/howto may be helpful'
        )
      }
    })
})

// /balance
bot.onText(/\/balance/, msg => {
  const userId = msg.from.id

  showKeys(String(userId))
    .then(keys => {
      if (keys.apiKey && keys.apiSecret) {
        getUserBalance(keys.apiKey, keys.apiSecret)
          .then(messyBalance => parseBalance(messyBalance))
          .then(parsedBalance =>
            bot.sendMessage(
              userId,
              parsedBalance
            )
          )
      } else {
        bot.sendMessage(
          userId,
          'You should register your keys first!\n\n/howto may be helpful'
        )
      }
    })
})

// /btc
bot.onText(/\/btc/, msg => {
  getUSDTforBTC()
    .then(result =>
      bot.sendMessage(
        msg.from.id,
        `1 BTC = ${result} USDT`
      )
    )
})

// /clear
bot.onText(/\/clear/, msg => {
  removeKeys(String(msg.from.id))
    .then(() =>
      bot.sendMessage(
        msg.from.id,
        'Your keys were successfully removed'
      )
    )
})

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
bot.onText(/\/donate/, msg => {
  bot.sendMessage(
    msg.from.id,
    DONATE_TO
  )
})

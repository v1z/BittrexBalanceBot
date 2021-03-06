# BittrexBalanceBot
This is a [Telegram](https://telegram.org/) bot which can show your balance 
on [Bittrex](https://bittrex.com/) for each coin as well as for summary.

## Tuning
Whole tuning process should be done in `config.js` file
### Required
To start your own copy of this bot you should tune following things:
1. Fill in your [bot token](https://github.com/v1z/BittrexBalanceBot/blob/master/config.js#L3). 
You will get it from Telegram when registering your bot;
2. Fill in your [MongoDB URI](https://docs.mongodb.com/manual/reference/connection-string/)
[here](https://github.com/v1z/BittrexBalanceBot/blob/master/config.js#L4).
### Optional
You can tune some others values to use additional features:
1. Set up your [Telegram USER_ID](https://github.com/v1z/BittrexBalanceBot/blob/master/config.js#L7) 
allowing to use `/users` command which will show amount of people who provided their Bittrex API keys to the bot;
2. You can add your own wallets for donations [here](https://github.com/v1z/BittrexBalanceBot/blob/master/config.js#L8).

## Working example
Working implementation of this bot you can find [here](http://telegram.me/BittrexBalanceBot).

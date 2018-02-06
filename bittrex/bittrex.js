const bittrex = require('node.bittrex.api');

// Remove coins with Balance: 0 from balance
const filterEmptyCoins = balance =>
  balance.filter(({ Balance }) => Balance !== 0);

// Parse user balance object and return array of coin names (['BCC', 'ETH', ...])
const balanceToCoinArray = balance =>
  balance
    .map(coin => coin.Currency)
    .filter(coin => coin !== 'BTC');

// Get last tick (price in BTC) of chosen coin
const getCoinToBTC = coin =>
  new Promise((resolve, reject) =>
    bittrex.sendCustomRequest(`https://bittrex.com/api/v1.1/public/getticker?market=BTC-${coin}`, ({ result: { Last: value } }, err) => (
      err === null
        ? resolve(value)
        : reject(err)
    )));

// Get last USDT-BTC price
const getUSDTforBTC = () =>
  new Promise((resolve, reject) =>
    bittrex.sendCustomRequest('https://bittrex.com/api/v1.1/public/getticker?market=USDT-BTC', ({ result: { Last: value } }, err) => (
      err === null
        ? resolve(value.toFixed())
        : reject(err)
    )));

// Altcoin balance to BTC value
const coinValueToBTC = (coins, rate) =>
  Number((coins * rate).toFixed(4));

// Magic!
const parseBalance = (balance) => {
  // drop out coins with zero amount
  const filteredBalance = filterEmptyCoins(balance);

  // get array of coin names ['BCC', 'ETH', ...]
  const coins = balanceToCoinArray(filteredBalance);
  // get array of coin rates to BTC [0.123, 0.034234, ...]
  const coinsRate = coins.map(getCoinToBTC);

  return getUSDTforBTC()
    .then(BTCtoUSDTrate =>
      Promise.all(coinsRate)
        .then(rates => rates.reduce((acc, rate, index) => ({ ...acc, [coins[index]]: rate }), {}))
        .then((rates) => {
          /* eslint-disable no-param-reassign */
          // add 'BTC': 1 to coin rates
          rates.BTC = 1;
          /* eslint-enable no-param-reassign */

          const summaryBTC = filteredBalance
            .reduce((acc, { Currency, Balance }) =>
              acc + coinValueToBTC(Balance, rates[Currency]), 0);

          const summaryUSDT = summaryBTC * BTCtoUSDTrate;

          const coinsBalances = filteredBalance
            .map(({ Currency, Balance }) => {
              const amountBTC = coinValueToBTC(Balance, rates[Currency]);
              const amountUSDT = (BTCtoUSDTrate * amountBTC).toFixed(2);

              return `${Currency}: ${Balance}\n${amountBTC} BTC\n${amountUSDT} USDT`;
            })
            .join('\n\n');

          return `${coinsBalances}\n\nTotal:\n${summaryBTC.toFixed(4)} BTC\n${summaryUSDT.toFixed(2)} USDT`;
        }));
};

// Send a request to Bittrex for user balance
exports.getUserBalance = (apikey, apisecret) =>
  new Promise((resolve, reject) => {
    bittrex.options({
      apikey,
      apisecret,
    });

    bittrex.getbalances(({ result }, err) => (
      err === null
        ? resolve(parseBalance(result))
        : reject(err.message)
    ));
  });

exports.getUSDTforBTC = getUSDTforBTC;

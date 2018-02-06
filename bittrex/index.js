const bittrex = require('node.bittrex.api');

// Parse user balance object and return array of coin literals (['BCC', 'ETH', ...])
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
  const filteredBalance = balance.filter(({ Balance }) => Balance !== 0);

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
            .reduce((acc, { Currency: currency, Balance: amount }) =>
              acc + coinValueToBTC(amount, rates[currency]), 0);

          const summaryUSDT = summaryBTC * BTCrate;

          const coinsBalances = filteredBalance
            .map(({ Currency: currency, Balance: amount }) => {
              const amountBTC = coinValueToBTC(amount, rates[currency]);
              const amountUSDT = (BTCrate * amountBTC).toFixed(2);

              return `${currency}: ${amount}\n${amountBTC} BTC\n${amountUSDT} USDT`;
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

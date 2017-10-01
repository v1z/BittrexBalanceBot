const { MongoClient } = require('mongodb');

const URI = '1234567';

// Connect function
let connectPromise;

const DBConnect = (uri = URI) => {
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = MongoClient.connect(uri)
    .then(db => db.collection('users'));

  return connectPromise;
};

// Insert user with 2 keys into the database
const insertUser = (userId, apiKey, apiSecret) =>
  DBConnect()
    .then(db => db.insert({
      user: userId,
      apiKey,
      apiSecret,
    }))
    .catch(err => Promise.reject(err));

// Return user keys or false if they weren't provided
const findUser = userId =>
  DBConnect()
    .then(db => db
      .find({ user: userId })
      .toArray())
    .catch(err => Promise.reject(err));

exports.insertUser = insertUser;

exports.findUser = findUser;

// Remove user from DB by UserId (drop user keys - allowing him to register new keys)
exports.removeUser = userId =>
  DBConnect()
    .then(db => db.deleteOne({ user: userId }))
    .catch(err => Promise.reject(err));

// Show how many users provided their keys
exports.usersCount = () =>
  DBConnect()
    .then(db => db.count())
    .catch(err => Promise.reject(err));

// Register new user by adding new user with 2 keys to users object
exports.registerUser = (userId, apiKey, apiSecret) => {
  // If keys are not valid - return error msg
  if (apiKey.length !== 32 || apiSecret.length !== 32) {
    return Promise.resolve('You provided invalid keys. Check their length to be 32 characters');
  }

  return findUser(userId)
    .then((user) => {
      // If user already provided keys to DB - return error msg
      if (user.length === 1) {
        return 'You are already registered your keys\n\nSend /keys to show them\n\nOr /clear to remove them';
      }
      // If user isn't in DB - insert his keys into DB and return welcome msg
      return insertUser(userId, apiKey, apiSecret)
        .then(() => 'Your keys accepted!\n\n/balance now available for you, enjoy');
    });
};

// Send private keys to user
exports.showKeys = userId =>
  findUser(userId)
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

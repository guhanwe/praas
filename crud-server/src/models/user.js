const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

module.exports = (db, DataTypes) => {
  const User = db.define('user', {
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        is: /^[a-z]+$/i,
        notEmpty: true
      }
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        is: /^[a-z]+$/i,
        notEmpty: true
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        is: /\S+@\S+\.\S+/,
        isLowercase: true,
        notEmpty: true
      },
      unique: true
    },
    hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    salt: DataTypes.STRING
  });

  User.prototype.setPassword = function (password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.hash = crypto
      .pbkdf2Sync(password, this.salt, 10000, 512, 'sha512')
      .toString('hex');
  };

  User.prototype.passwordValid = function (password) {
    const hash = crypto
      .pbkdf2Sync(password, this.salt, 10000, 512, 'sha512')
      .toString('hex');
    return this.hash === hash;
  };

  User.prototype.generateJWT = function () {
    const today = new Date();
    const exp = new Date(today);
    exp.setDate(today.getDate() + 60);

    return jwt.sign({
      id: this.id,
      email: this.email,
      exp: parseInt(exp.getTime() / 1000),
    }, config.secret);
  };

  User.prototype.toAuthJSON = function () {
    const tkn = this.generateJWT();

    return {
      id: this.id,
      firstname: this.firstname,
      lastname: this.lastname,
      email: this.email,
      token: tkn
    };
  };

  return User;
};
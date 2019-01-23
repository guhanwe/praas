const router = require('express').Router();
const User = require('../../models').User;
const auth = require('../auth');
const helpers = require('../../lib/helpers');
const passport = require('passport');

router.get('/user', auth.required, async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.payload.id } });
    if (!user) return res.sendStatus(401);
    return res.json({ user: user.toAuthJSON() });
  } catch (error) {
    next(error);
  }
});

// Registration
router.post('/users', async (req, res, next) => {
  const user = new User();
  const errors = {};

  const userReqFields = ['firstName', 'email', 'password'];
  const userOptFields = ['lastName'];
  helpers.processInput(req.body.user, userReqFields, userOptFields, user, errors);
  if (Object.keys(errors).length) return res.status(422).json({ errors });

  try {
    const result = await user.save();
    return res.json({ user: result.toAuthJSON() });
  } catch ({ name, errors: dberrors, fields }) {
    // console.log(name, errors, fields);
    if (name === 'SequelizeUniqueConstraintError') {
      for (let i = 0; i < fields.length; i++) {
        errors[fields[i]] = dberrors[i].message;
      }
      return res.status(422).json({ errors });
    } else {
      errors.unknown = 'unknown error, please contact support';
      next(errors);
    }
  }
});

// Update User
router.put('/user', auth.required, function (req, res, next) {
  User.findById(req.payload.id).then(function (user) {
    if (!user) return res.sendStatus(401);

    const userOptFields = ['firstName', 'lastName', 'password'];
    helpers.processInput(req.body.user, [], userOptFields, user, {});

    return user.save().then(function () {
      return res.json({ user: user.toAuthJSON() });
    });
  }).catch((reason) => {
    console.log('error: ', reason);
    next(reason);
  });
});

// Authentication
router.post('/users/login', function (req, res, next) {
  // const errors = {};

  // if (!req.body.user.email) {
  //   errors.email = 'email is invalid';
  // }

  // if (!req.body.user.password) {
  //   errors.password = 'password is invalid';
  // }

  // if (Object.keys(errors).length === 0) {
  //   return res.status(422).json({ errors });
  // }

  passport.authenticate('local', { session: false }, function (err, user, info) {
    if (err) {
      return next(err);
    }

    if (user) {
      // user.token = user.generateJWT();
      return res.json({ ...user.toAuthJSON() });
    } else {
      return res.status(422).json(info);
    }
  })(req, res, next);
});

module.exports = router;

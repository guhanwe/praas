const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');

const config = require('../../config');
const { RestApiError } = require('../../lib/error');
const tokenService = require('./token-service');
const { Airtable } = require('./integrations/airtable');

// cache frequently used objects
// service endpoint base (includes hostname and path to service, if any)
const SEP_BASE = {};
config.targets.settings.forEach((i) => (SEP_BASE[i.type] = i.suri));

// declare these once
const opsNeedingBody = ['PUT', 'POST', 'PATCH']; // have records in body ?
const opsNeedingId = ['PUT', 'PATCH']; // have id field in body ?

// array of middleware that go in the front of stack
// NOTE:
// - order matters but not verified to be correct
// - e.g. should cors go first?
function head(options = {}) {
  const frontOptions = {
    urlencoded: options.urlencoded ?? { extended: true },
  };

  const upload = multer();
  return [
    cors(),
    bodyParser.json(),
    bodyParser.urlencoded(frontOptions.urlencoded),
    upload.none(),
  ];
}

// array of middleware organized by feature and order of precedence
// if any of these get big and complex they can be moved out.
function middle({ cmap = [], debug = false }) {
  if (debug) {
    console.log(`baking gateway middleware for ${cmap.length} conduits`);
  }

  function preflightCheck(req, res, next) {
    if (debug) {
      console.log(`preflight-check: ${req.hostname}`);
    }
    // console.log('req from: ', req.hostname);
    const conduit = cmap.get(req.hostname);
    if (conduit) {
      // cache it for the next handler, we do it here in case the cache
      // expires before getting into the next middleware.
      res.locals.conduit = conduit;
      next(); // all good, proceed to next in chain!
    } else {
      // If conduit not found in Cache, send 404
      // FIXME: per MDN, the statusCode should be 400
      return next(
        new RestApiError(404, {
          conduit: `${req.hostname} not found`,
        })
      );
    }
  }

  function allowlistCheck(req, res, next) {
    // Top of the stack check is ip allow-list check
    // - Only IPv4 is handled in v1
    // - We implicitly allow loopback address (127.0.0.1)
    // - empty allowlist implies all origins allowed
    // - the code that follows may not be optimal.
    const clientIp = req.connection.remoteAddress;
    const conduit = res.locals.conduit;
    const allowlist = conduit.allowlist;
    if (debug) {
      console.log(
        `allowlist-check: client -> ${clientIp}, allowlist -> ${allowlist}`
      );
    }

    if (allowlist.length > 0 && clientIp !== '127.0.0.1') {
      let allowed = false,
        inactive = 0;
      for (let i = 0, imax = allowlist.length; i < imax; i++) {
        const item = allowlist[i];
        if (item.status === 'active' && item.ip === clientIp) {
          allowed = true;
          break;
        }

        if (item.status === 'inactive') {
          inactive++;
        }
      }

      if (!allowed && inactive !== allowlist.length) {
        // console.log('---->', clientIp, allowlist, inactive);
        return next(
          new RestApiError(403, { client: `${clientIp} restricted` })
        );
      }
    }

    next(); // all good, proceed to next in chain!
  }

  function racmCheck(req, res, next) {
    // check racm for allowed methods
    const racm = res.locals.conduit.racm;
    if (debug) {
      console.log(`racm-check: ${req.method} in ${racm}`);
    }

    if (racm.findIndex((method) => method === req.method) === -1) {
      return next(
        new RestApiError(405, {
          [req.method]: 'not permitted',
        })
      );
    }

    next(); // all good, proceed to next in chain!
  }

  function apiComplianceCheck(req, res, next) {
    const records = req.body.records;
    if (debug) {
      console.log(`api-compliance-check: ${req.method}`, records);
    }

    if (opsNeedingBody.includes(req.method)) {
      if (!records) {
        return next(
          new RestApiError(422, {
            records: 'not present',
          })
        );
      }

      if (records?.[0].fields === undefined) {
        // PUT, POST and PATCH operations need fields data in body
        return next(
          new RestApiError(422, {
            fields: 'not present',
          })
        );
      }
    }

    if (opsNeedingId.includes(req.method) && records?.[0].id === undefined) {
      return next(
        new RestApiError(422, {
          id: 'not provided',
        })
      );
    }

    // GET and DELETE don't need request body
    // FIXME! is this the right place to do this?
    if (!opsNeedingBody.includes(req.method)) {
      delete req.body;
    }

    next(); // all good, proceed to next in chain!
  }

  // perform hidden form field validation...
  // TODO:
  // - is this needed for PUT and PATCH as well?
  // - hmm why is this being done only on record[0]?
  // - what about bulk updates and batch creation?
  function hffCheck(req, res, next) {
    if (debug) {
      console.log(`hff-check: ${req.method}`);
    }

    if (req.method === 'POST') {
      const hiddenFormField = res.locals.conduit.hiddenFormField;
      for (let i = 0, imax = hiddenFormField.length; i < imax; i++) {
        // We`ll be using this multiple times, so store in a short variable
        const hff = hiddenFormField[i];
        const reqHff = req.body.records?.[0].fields[hff.fieldName];

        // This feature is to catch spam bots, so don't
        // send error if failure, send 200-OK instead
        if (hff.policy === 'drop-if-filled' && reqHff) {
          return res.sendStatus(200);
        }

        if (hff?.policy === 'pass-if-match' && !(reqHff === hff.value)) {
          return res.sendStatus(200);
        }

        if (!hff.include) {
          delete req.body.records[0].fields[hff.fieldName];
        }
      }
    }

    next(); // all good, proceed to next in chain!
  }

  // prettier-ignore
  return [
    preflightCheck, allowlistCheck, racmCheck, apiComplianceCheck, hffCheck,
  ];
}

// backend of the gateway is responsible for invoking the correct integration
// TODO:
// - write up the protocol for writing an `integration`
// - at a minimum there are three phases:
//   - imap (input: {airtableish-inbound-data, meta}, output: integration-outbound-data)
//   - transmit(input: integration-outbound-data, output: integration-inbound-data)
//   - omap(input: {integration-inbound-data, meta}, output: airtableish-outbound-data)
function tail({ debug = false }) {
  // cache integrations to non-traditional-storage
  const ntsHandlers = {
    airtable: Airtable({ debug }),
  };

  return async function proxy(req, res, next) {
    const conduit = res.locals.conduit;
    const nts = ntsHandlers[conduit.suriType];
    const token = await tokenService.getAccessToken(
      conduit.suriType,
      conduit.suriApiKey
    );

    // scoped container...
    const inbound = {
      suri: SEP_BASE[conduit.suriType], // base URI to service endpoint
      container: conduit.suriObjectKey, // sheet, table, inbox, bucket, folder, ...
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.user.token}`,
      },

      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
    };

    if (!nts) {
      next(
        new RestApiError(500, {
          suriType: `unknown ${conduit.suriType}`,
        })
      );
    } else {
      try {
        const { okay, ...rest } = nts.imap(inbound);
        if (okay) {
          const response = await nts.transmit(rest);
          const { status, data } = await nts.omap(response);
          res.status(status).send(data);
        }
      } catch (e) {
        next(e);
      }
    }
  };
}

module.exports = {
  head,
  middle,
  tail,
};

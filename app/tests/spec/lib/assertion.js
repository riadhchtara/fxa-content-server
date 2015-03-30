/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';


define([
  'chai',
  'jquery',
  'sinon',
  '../../lib/helpers',
  'lib/promise',
  'lib/config-loader',
  'lib/constants',
  'lib/assertion',
  'lib/fxa-client',
  'models/reliers/relier',
  'vendor/jwcrypto',
  'vendor/jwcrypto/lib/algs/rs'
],
// FxaClientWrapper is the object that is used in
// fxa-content-server views. It wraps FxaClient to
// take care of some app-specific housekeeping.
function (chai, $, sinon, TestHelpers, p, ConfigLoader,
      Constants, Assertion, FxaClientWrapper, Relier, jwcrypto) {
  var assert = chai.assert;
  var AUDIENCE = 'http://123done.org';
  var ISSUER = 'http://' + document.location.hostname + ':9000';
  var email;
  var password = 'password';
  var client;
  var assertionLibrary;
  var relier;
  var sessionToken;
  var config;

  var LONG_LIVED_ASSERTION_DURATION = 1000 * 3600 * 24 * 365 * 25; // 25 years

  describe('lib/assertion', function () {
    /*global before*/

    before(function () {
      var configLoader = new ConfigLoader();
      return configLoader.fetch()
        .then(function (loadedConfig) {
          config = loadedConfig;
        });
    });

    beforeEach(function () {
      ISSUER = config.authServerUrl;

      relier = new Relier();
      client = new FxaClientWrapper({
        relier: relier,
        authServerUrl: config.authServerUrl
      });
      assertionLibrary = new Assertion({
        fxaClient: client
      });
      email = ' ' + TestHelpers.createEmail() + ' ';

      return client.signUp(email, password, relier, {
        preVerified: true
      })
        .then(function (result) {
          sessionToken = result.sessionToken;
        });
    });

    describe('validate', function () {
      it('generates a valid assertion', function () {
        var assertion;
        return assertionLibrary.generate(sessionToken, AUDIENCE)
          .then(function (ass) {
            assertion = ass;
            assert.isNotNull(ass, 'Assertion is not null');
            assert.include(ass, '~', 'Result has the ~');
          })
          .then(function () {
            var defer = p.defer();
            $.getJSON(ISSUER + '/.well-known/browserid', function (data) {
              function throwIfNotNumber(n, message) {
                if (typeof n !== 'number') {
                  throw new Error(message);
                }
              }

              try {
                assert.ok(data, 'Received .well-known data');
                var fxaRootKey = jwcrypto.loadPublicKeyFromObject(data['public-key']);
                var fullAssertion = jwcrypto.cert.unbundle(assertion);
                var components = jwcrypto.extractComponents(fullAssertion.certs[0]);
                var assertionPublicKey = jwcrypto.loadPublicKey(JSON.stringify(components.payload['public-key']));
                // construct the checkDate based on the assertion's expiry time, not the certificate's
                var assertionComponents = jwcrypto.extractComponents(fullAssertion.signedAssertion);
                var checkDate = new Date(assertionComponents.payload.exp - 1);

                assert.ok(components.payload.iss, 'Issuer exists');
                assert.ok(components.payload.iat, 'Issued date exists');
                assert.ok(components.payload.exp, 'Expire date exists');

                throwIfNotNumber(components.payload.iat, 'cert lacks an "issued at" (.iat) field');
                throwIfNotNumber(components.payload.exp, 'cert lacks an "expires" (.exp) field');

                if (components.payload.exp < components.payload.iat) {
                  throw new Error('assertion expires before cert is valid');
                }

                if (components.payload.exp > (components.payload.exp + 5000)) {
                  throw new Error('assertion was likely issued after cert expired');
                }

                if (assertionComponents.payload.exp < (Date.now() + LONG_LIVED_ASSERTION_DURATION - 5000)) {
                  throw new Error('assertion should be long lived');
                }

                jwcrypto.assertion.verify(jwcrypto,
                  fullAssertion.signedAssertion, assertionPublicKey, checkDate,
                  function (err, payload, assertionParams) {
                    if (err) {
                      defer.reject(new Error('assertion is NOT properly signed: ' + err ));
                    } else {
                      assert.ok(payload, 'has payload');
                      assert.ok(assertionParams, 'has assertion params');
                      defer.resolve({
                        fxaRootKey: fxaRootKey,
                        payload: payload,
                        checkDate: checkDate,
                        assertion: assertion,
                        assertionParams: assertionParams
                      });
                    }
                  }
                );

              } catch (e) {
                defer.reject(e);
              }
            })
            .fail(function () {
              defer.reject(new Error('failed to feth .well-known/browserid'));
            });

            return defer.promise;
          });
      });
    });

  });
});


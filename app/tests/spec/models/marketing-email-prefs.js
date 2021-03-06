/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'chai',
  'sinon',
  'lib/promise',
  'lib/constants',
  'lib/marketing-email-client',
  'models/marketing-email-prefs',
  'models/account',
  'models/oauth-token'
],
function (chai, sinon, p, Constants, MarketingEmailClient,
  MarketingEmailPrefs, Account, OAuthToken) {
  'use strict';

  var assert = chai.assert;

  describe('models/marketing-email-prefs', function () {
    var account;
    var oAuthToken;
    var marketingEmailPrefs;
    var marketingEmailClient;

    var BASE_URL = 'http://basket.proxy.org';
    var PREFERENCES_URL = 'https://www.allizom.org/newsletter/existing/';
    var NEWSLETTER_ID = Constants.MARKETING_EMAIL_NEWSLETTER_ID;

    beforeEach(function () {
      marketingEmailClient = new MarketingEmailClient({
        baseUrl: BASE_URL,
        preferencesUrl: PREFERENCES_URL
      });

      account = new Account({});
      oAuthToken = new OAuthToken({
        token: 'oauth_token'
      });
      sinon.stub(oAuthToken, 'destroy', function () {
        return p();
      });

      sinon.stub(account, 'createOAuthToken', function () {
        return p(oAuthToken);
      });

      marketingEmailPrefs = new MarketingEmailPrefs({
        account: account,
        marketingEmailClient: marketingEmailClient
      });
    });

    describe('fetch', function () {
      it('fetches the user\'s email preferences from basket', function () {
        sinon.stub(marketingEmailClient, 'fetch', function () {
          return p({
            preferencesUrl: PREFERENCES_URL + 'user_token',
            newsletters: [ NEWSLETTER_ID ]
          });
        });

        return marketingEmailPrefs.fetch()
          .then(function () {
            assert.isTrue(marketingEmailClient.fetch.calledWith('oauth_token'));
            assert.isTrue(marketingEmailPrefs.isOptedIn(NEWSLETTER_ID));
            assert.equal(
              marketingEmailPrefs.get('preferencesUrl'), PREFERENCES_URL + 'user_token');
            assert.isTrue(oAuthToken.destroy.called);
          });
      });
    });

    describe('optIn', function () {
      it('does nothing if the user is already opted in', function () {
        sinon.spy(marketingEmailClient, 'optIn');

        marketingEmailPrefs.set('newsletters', [NEWSLETTER_ID]);
        return marketingEmailPrefs.optIn(NEWSLETTER_ID)
          .then(function () {
            assert.isFalse(marketingEmailClient.optIn.called);
          });
      });

      it('opts the user in to marketing email if not opted already in', function () {
        sinon.stub(marketingEmailClient, 'optIn', function () {
          return p();
        });

        marketingEmailPrefs.set('newsletters', []);
        return marketingEmailPrefs.optIn(NEWSLETTER_ID)
          .then(function () {
            assert.isTrue(
              marketingEmailClient.optIn.calledWith(
                'oauth_token',
                NEWSLETTER_ID
              )
            );
            assert.isTrue(marketingEmailPrefs.isOptedIn(NEWSLETTER_ID));
            assert.isTrue(oAuthToken.destroy.called);
          });
      });
    });

    describe('optOut', function () {
      it('does nothing if not opted in', function () {
        sinon.spy(marketingEmailClient, 'optOut');

        marketingEmailPrefs.set('newsletters', []);
        return marketingEmailPrefs.optOut(NEWSLETTER_ID)
          .then(function () {
            assert.isFalse(marketingEmailClient.optOut.called);
          });
      });

      it('opts the user out of marketing email if opted in', function () {
        sinon.stub(marketingEmailClient, 'optOut', function () {
          return p();
        });

        marketingEmailPrefs.set('newsletters', [ NEWSLETTER_ID ]);
        return marketingEmailPrefs.optOut(NEWSLETTER_ID)
          .then(function () {
            assert.isTrue(
              marketingEmailClient.optOut.calledWith(
                'oauth_token',
                NEWSLETTER_ID
              )
            );
            assert.isFalse(marketingEmailPrefs.isOptedIn(NEWSLETTER_ID));
            assert.isTrue(oAuthToken.destroy.called);
          });
      });
    });
  });
});

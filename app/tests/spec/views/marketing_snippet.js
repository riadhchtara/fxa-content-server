/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';


define([
  'chai',
  'views/marketing_snippet',
  'lib/metrics',
  '../../mocks/window'
],
function (chai, View, Metrics, WindowMock) {
  var assert = chai.assert;

  describe('views/marketing_snippet', function () {
    var view, windowMock, metrics;

    function createView(options) {
      options.window = windowMock;

      metrics = new Metrics();
      options.metrics = metrics;

      view = new View(options);
    }

    beforeEach(function () {
      windowMock = new WindowMock();
    });

    afterEach(function () {
      view.remove();
      view.destroy();
      view = windowMock = null;
    });

    describe('render', function () {
      it('shows sign up marketing material to desktop sync users', function () {
        windowMock.navigator.userAgent = 'Mozilla/5.0 (Windows NT x.y; rv:31.0) Gecko/20100101 Firefox/31.0';

        createView({
          type: 'sign_up',
          service: 'sync',
          language: 'en',
          newsletterOptinPercentage: 0
        });

        return view.render()
            .then(function () {
              assert.equal(view.$('.marketing.default').length, 1);
              assert.equal(view.$('.marketing.newsletter-optin').length, 0);
            });
      });

      it('shows nothing to english speaking non-sync users', function () {
        windowMock.navigator.userAgent = 'Mozilla/5.0 (Windows NT x.y; rv:31.0) Gecko/20100101 Firefox/31.0';

        createView({
          type: 'sign_up',
          language: 'en'
        });

        return view.render()
            .then(function () {
              assert.equal(view.$('.marketing.default').length, 0);
            });
      });

      it('shows newsletter optin to users on Firefox for Android', function () {
        windowMock.navigator.userAgent = 'Mozilla/5.0 (Android; Tablet; rv:26.0) Gecko/26.0 Firefox/26.0';

        createView({
          type: 'sign_up',
          service: 'sync',
          language: 'en',
          newsletterOptinPercentage: 0
        });

        return view.render()
            .then(function () {
              assert.equal(view.$('.marketing.newsletter-optin').length, 1);
            });
      });


      it('shows newsletter optin to users on B2G', function () {
        windowMock.navigator.userAgent = 'Mozilla/5.0 (Mobile; rv:26.0) Gecko/26.0 Firefox/26.0';
        createView({
          type: 'sign_up',
          service: 'sync',
          language: 'en',
          newsletterOptinPercentage: 0
        });

        return view.render()
            .then(function () {
              assert.equal(view.$('.marketing.newsletter-optin').length, 1);
            });
      });

      it('logs the marketing type and link', function () {
        createView({
          type: 'sign_up',
          service: 'sync',
          language: 'de',
          newsletterOptinPercentage: 0
        });

        return view.render()
            .then(function () {
              var filteredData = metrics.getFilteredData();
              assert.ok(filteredData.marketingType);
              assert.ok(filteredData.marketingLink);
              assert.isFalse(filteredData.marketingClicked);
            });
      });
    });

    describe('render/show newsletter-optin', function () {
      it('shows newsletter-optin', function () {
        createView({
          type: 'sign_up',
          service: 'sync',
          language: 'de',
          newsletterOptinPercentage: 100
        });

        return view.render()
            .then(function () {
              assert.equal(view.$('.marketing.default').length, 0);
              assert.equal(view.$('.marketing.newsletter-optin').length, 1);
            });
      });

    });


    describe('a click on the marketing material', function () {
      it('is logged', function () {
        createView({
          type: 'sign_up',
          service: 'sync',
          language: 'de',
          newsletterOptinPercentage: 0
        });

        return view.render()
            .then(function () {
              view.$('.marketing-link').click();
            })
            .then(function () {
              var filteredData = metrics.getFilteredData();
              assert.isTrue(filteredData.marketingClicked);
            });
      });
    });
  });
});




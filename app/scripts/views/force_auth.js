/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'lib/promise',
  'views/base',
  'views/form',
  'views/sign_in',
  'stache!templates/force_auth',
  'lib/session',
  'lib/auth-errors'
],
function (p, BaseView, FormView, SignInView, Template, Session, AuthErrors) {
  function getFatalErrorMessage(self, fatalError) {
    if (fatalError) {
      return self.translateError(fatalError);
    }

    return '';
  }


  var View = SignInView.extend({
    template: Template,
    className: 'sign-in',

    initialize: function (options) {
      options = options || {};

      // The session is cleared just after this. Store
      // the prefillPassword so it can be inserted into the DOM.
      this._prefillPassword = Session.prefillPassword;

      // forceAuth means a user must sign in as a specific user.
      // kill the user's local session.
      Session.clear();
      this.user.clearSignedInAccount();
    },

    context: function () {
      var fatalError = '';
      var email = this.relier.get('email');

      if (! email) {
        fatalError = AuthErrors.toError('FORCE_AUTH_EMAIL_REQUIRED');
      }

      return {
        email: email,
        password: this._prefillPassword,
        fatalError: getFatalErrorMessage(this, fatalError),
        isPasswordAutoCompleteDisabled: this.isPasswordAutoCompleteDisabled()
      };
    },

    events: {
      'click a[href="/confirm_reset_password"]': BaseView.cancelEventThen('resetPasswordNow'),
      // Backbone does not add SignInView's events, so this must be duplicated.
      'change .show-password': 'onPasswordVisibilityChange'
    },

    beforeDestroy: function () {
      Session.set('prefillPassword', this.$('.password').val());
    },

    submit: function () {
      var account = this.user.initAccount({
        email:  this.relier.get('email'),
        password: this.$('.password').val()
      });

      return this._signIn(account);
    },

    onSignInError: function (err) {
      if (AuthErrors.is(err, 'UNKNOWN_ACCOUNT')) {
        // dead end, do not allow the user to sign up.
        this.displayError(err);
      } else {
        return SignInView.prototype.onSignInError.call(this, err);
      }
    },

    resetPasswordNow: function () {
      var self = this;
      return p().then(function () {
        // If the user is already making a request, ban submission.
        if (self.isSubmitting()) {
          throw new Error('submit already in progress');
        }

        var email = self.relier.get('email');
        self._isSubmitting = true;

        return self.fxaClient.passwordReset(email, self.relier)
                .then(function (result) {
                  self._isSubmitting = false;
                  self.navigate('confirm_reset_password', {
                    data: {
                      email: email,
                      passwordForgotToken: result.passwordForgotToken
                    }
                  });
                }, function (err) {
                  self._isSubmitting = false;
                  self.displayError(err);
                });
      });
    },

    /**
     * Displays the account's avatar
     */

    afterVisible: function () {
      var email = this.relier.get('email');
      var account = this.user.getAccountByEmail(email);

      // Use FormView's afterVisible because SignIn attemps to
      // display a profile image for the "suggested" account.
      FormView.prototype.afterVisible.call(this);

      // Only display the profile image if we have a cached account
      if (account.get('email') === email) {
        return this.displayProfileImage(account);
      }
    }
  });

  return View;
});

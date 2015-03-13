/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'cocktail',
  'underscore',
  'lib/promise',
  'views/base',
  'views/form',
  'stache!templates/sign_up',
  'lib/session',
  'lib/auth-errors',
  'lib/strings',
  'lib/mailcheck',
  'views/mixins/password-mixin',
  'views/mixins/service-mixin'
],
function (Cocktail, _, p, BaseView, FormView, Template, Session, AuthErrors,
      Strings, mailcheck, PasswordMixin, ServiceMixin) {
  var t = BaseView.t;

  function selectAutoFocusEl(bouncedEmail, email, password) {
    if (bouncedEmail) {
      return 'email';
    } else if (! email) {
      return 'email';
    } else if (! password) {
      return 'password';
    }
    return 'year';
  }

  var now = new Date();
  var CUTOFF_AGE = {
    year: now.getFullYear() - 13,
    month: now.getMonth(),
    date: now.getDate()
  };

  var View = FormView.extend({
    template: Template,
    className: 'sign-up',

    initialize: function (options) {
      options = options || {};

      this._formPrefill = options.formPrefill;
    },

    beforeRender: function () {
      if (document.cookie.indexOf('tooyoung') > -1) {
        this.navigate('cannot_create_account');
        return p(false);
      }

      // TODO #1913 - get from the User model when ready.
      this._bouncedEmail = this.ephemeralMessages.get('bouncedEmail');

      return FormView.prototype.beforeRender.call(this);
    },

    afterRender: function () {
      this._addSelectRowBehavior();
      this._selectPrefillYear();

      this.transformLinks();

      return FormView.prototype.afterRender.call(this);
    },

    // handles select-row hack (issue 822)
    _addSelectRowBehavior: function () {
      var select = this.$el.find('.select-row select');
      select.focus(function (){
        $(this).parent().addClass('select-focus');
      });
      select.blur(function (){
        select.parent().removeClass('select-focus');
      });
      select.change(function (){
        select.parent().removeClass('invalid-row');
      });
    },

    afterVisible: function () {
      if (this._bouncedEmail) {
        this.showValidationError('input[type=email]',
                  AuthErrors.toError('SIGNUP_EMAIL_BOUNCE'));
      }

      if (this.broker.isAutomatedBrowser()) {
        // helps avoid 'focus' issues with Firefox Selenium Driver
        // See https://code.google.com/p/selenium/issues/detail?id=157
        this.$el.find('input[type=password]').click(function () {
          this.suggestEmail();
        }.bind(this));
      }

      return FormView.prototype.afterVisible.call(this);
    },

    events: {
      'keydown #fxa-age-year': 'submitOnEnter',
      'keydown #fxa-age-month': 'submitOnEnter',
      'keydown #fxa-age-date': 'submitOnEnter',
      'change #fxa-age-year': 'onUserYearSelect',
      'change #fxa-age-month': 'onUserMonthSelect',
      'blur input.email': 'suggestEmail'
    },

    getPrefillEmail: function () {
      // formPrefill.email comes first because users can edit the email,
      // go to another screen, edit the email again, and come back here. We
      // want the last used email.
      return this._formPrefill.get('email') || this.relier.get('email');
    },

    context: function () {
      var prefillEmail = this.getPrefillEmail();
      var formPrefill = this._formPrefill;
      var prefillPassword = formPrefill.get('password');
      var prefillYear = formPrefill.get('year') || 'none';

      var autofocusEl = selectAutoFocusEl(
            this._bouncedEmail, prefillEmail, prefillPassword);

      var relier = this.relier;
      return {
        serviceName: relier.get('serviceName'),
        isSync: relier.isSync(),
        isCustomizeSyncChecked: relier.isCustomizeSyncChecked(),
        isPasswordAutoCompleteDisabled: this.isPasswordAutoCompleteDisabled(),
        email: prefillEmail,
        password: prefillPassword,
        year: prefillYear,
        shouldFocusEmail: autofocusEl === 'email',
        shouldFocusPassword: autofocusEl === 'password',
        shouldFocusYear: autofocusEl === 'year',
        error: this.error
      };
    },

    beforeDestroy: function () {
      var formPrefill = this._formPrefill;
      formPrefill.set('email', this.getElementValue('.email'));
      formPrefill.set('password', this.getElementValue('.password'));
      formPrefill.set('year', this.$('#fxa-age-year').val());
    },

    submitOnEnter: function (event) {
      if (event.which === 13) {
        this.validateAndSubmit();
      }
    },

    isValidEnd: function () {
      if (this._isEmailSameAsBouncedEmail()) {
        return false;
      }

      if (this._isEmailFirefoxDomain()) {
        return false;
      }

      if (! this._validateYear()) {
        return false;
      }

      if (this._getYear() === CUTOFF_AGE.year) {
        return this._validateMonthAndDate();
      }

      return FormView.prototype.isValidEnd.call(this);
    },

    showValidationErrorsEnd: function () {
      if (this._isEmailSameAsBouncedEmail()) {
        this.showValidationError('input[type=email]',
                AuthErrors.toError('DIFFERENT_EMAIL_REQUIRED'));
      } else if (this._isEmailFirefoxDomain()) {
        this.showValidationError('input[type=email]',
                AuthErrors.toError('DIFFERENT_EMAIL_REQUIRED_FIREFOX_DOMAIN'));
      } else if (! this._validateYear()) {
        //next two lines deal with ff30's select list regression
        var selectYearRow = $('#fxa-age-year').parent();
        selectYearRow.addClass('invalid-row');

        this.showValidationError('#fxa-age-year',
                AuthErrors.toError('YEAR_OF_BIRTH_REQUIRED'));
      } else if (this._getYear() === CUTOFF_AGE.year &&
               ! this._validateMonthAndDate()) {
        var selectMonthDateRow =
              this.$('#fxa-age-month, #fxa-age-date').parent();
        selectMonthDateRow.addClass('invalid-row');

        this.showValidationError('#fxa-age-month',
                AuthErrors.toError('BIRTHDAY_REQUIRED'));
      }
    },

    submit: function () {
      var self = this;
      return p()
        .then(function () {
          if (! self._isUserOldEnough()) {
            return self._cannotCreateAccount();
          }

          return self._initAccount();
        });
    },

    suggestEmail: function () {
      mailcheck(this.$el.find('.email'), this.metrics, this.translator, this.window.location.search);
    },

    _isEmailSameAsBouncedEmail: function () {
      return (this._bouncedEmail &&
             (this.getElementValue('input[type=email]') === this._bouncedEmail));
    },

    _getSelectedUserAge: function () {
      var self = this;
      return {
        year: self._getYear(),
        month: self._getMonth(),
        date: self._getDate()
      };
    },

    _validateYear: function () {
      return ! isNaN(this._getYear());
    },

    _validateMonthAndDate: function () {
      return ! (isNaN(this._getMonth()) || isNaN(this._getDate()));
    },

    _getYear: function () {
      return parseInt(this.$('#fxa-age-year').val(), 10);
    },

    _getMonth: function () {
      return parseInt(this.$('#fxa-age-month').val(), 10);
    },

    _getDate: function () {
      return parseInt(this.$('#fxa-age-date').val(), 10);
    },

    _isUserOldEnough: function (userAge) {
      userAge = userAge || this._getSelectedUserAge();
      if (userAge.year < CUTOFF_AGE.year) {
        return true;
      } else if (userAge.year === CUTOFF_AGE.year &&
                 userAge.month < CUTOFF_AGE.month) {
        return true;
      }

      return (userAge.year === CUTOFF_AGE.year &&
                 userAge.month === CUTOFF_AGE.month &&
                 userAge.date <= CUTOFF_AGE.date);
    },

    _isEmailFirefoxDomain: function () {
      var email = this.$('.email').val();

      // some users input a "@firefox.com" email.
      // this is not a valid email at this time, therefore we block the attempt.
      if (email.indexOf('@firefox.com') >= 0) {
        return true;
      }

      return false;
    },

    _cannotCreateAccount: function () {
      // this is a session cookie. It will go away once:
      // 1. the user closes the tab
      // and
      // 2. the user closes the browser
      // Both of these have to happen or else the cookie
      // hangs around like a bad smell.
      document.cookie = 'tooyoung=1;';

      this.navigate('cannot_create_account');
    },

    _initAccount: function () {
      var self = this;
      var email = self.$('.email').val();
      var password = self.$('.password').val();
      var customizeSync = self.$('.customize-sync').is(':checked');
      var preVerifyToken = self.relier.get('preVerifyToken');

      if (preVerifyToken) {
        self.logScreenEvent('preverified');
      }

      if (self.relier.isSync()) {
        self.logScreenEvent('customizeSync.' + String(customizeSync));
      }

      return self.broker.beforeSignIn(email)
        .then(function () {
          return self.fxaClient.signUp(
                        email, password, self.relier, {
                          customizeSync: customizeSync
                        });
        }).then(function (accountData) {
          var account = self.user.initAccount(accountData);

          if (preVerifyToken && account.get('verified')) {
            self.logScreenEvent('preverified.success');
          }
          self.logScreenEvent('success');

          return self.user.setSignedInAccount(account)
            .then(function () {
              return account;
            });
        })
        .then(_.bind(self.onSignUpSuccess, self))
        .then(null, function (err) {
          // Account already exists. No attempt is made at signing the
          // user in directly, instead, point the user to the signin page
          // where the entered email/password will be prefilled.
          if (AuthErrors.is(err, 'ACCOUNT_ALREADY_EXISTS')) {
            return self._suggestSignIn(err);
          } else if (AuthErrors.is(err, 'USER_CANCELED_LOGIN')) {
            self.logEvent('login.canceled');
            // if user canceled login, just stop
            return;
          }

          // re-throw error, it will be handled at a lower level.
          throw err;
        });
    },

    onUserYearSelect: function () {
      if (this._getYear() === CUTOFF_AGE.year) {
        this._toggleDatePicker();
      }
    },

    onUserMonthSelect: function () {
      var datePickerEl = this.$('#fxa-age-date');
      var selectedYear = this._getYear();
      var selectedMonth = this._getMonth();
      var selectedDate = this._getDate();

      if (isNaN(selectedMonth)) {
        this._disableDatePicker(datePickerEl);
      } else {
        this._enableDatePicker(datePickerEl);
      }

      var daysInMonth = this._daysInMonth(selectedYear, selectedMonth);
      this._updateDatePickerValues(datePickerEl, daysInMonth);

      if (this._isValidDateForMonth(selectedDate, daysInMonth)) {
        datePickerEl.val(selectedDate);
      }
    },

    //if the user changes from march to february (or similar),
    //we need to reset out-of-bounds dates, or keep in-bounds dates
    _isValidDateForMonth: function (date, daysInMonth) {
      return (! isNaN(date)) && date <= daysInMonth;
    },

    _disableDatePicker: function (datePickerEl) {
      datePickerEl.attr('disabled', 'true');
      datePickerEl.parent().addClass('disabled');
    },

    _enableDatePicker: function (datePickerEl) {
      datePickerEl.removeAttr('disabled');
      datePickerEl.parent().removeClass('disabled');
    },

    _updateDatePickerValues: function (datePickerEl, days) {
      var defaultValue = datePickerEl.children(':eq(0)');
      datePickerEl.empty();
      datePickerEl.append(defaultValue);
      for (var i = 1; i <= days; i++) {
        var optionHtml = Strings.interpolate(
          '<option id="fxa-day-%s" value="%s">%s</option>', [i, i, i]);
        datePickerEl.append(optionHtml);
      }
    },

    _daysInMonth: function (year, month) {
      return new Date(year, month + 1, 0).getDate();
    },

    _toggleDatePicker: function () {
      this.$('#year-picker').addClass('hidden');
      this.$('#month-date-picker').removeClass('hidden');
      this.focus('#fxa-age-month');
    },

    onSignUpSuccess: function (account) {
      var self = this;
      if (account.get('verified')) {
        // user was pre-verified, notify the broker.
        return self.broker.afterSignIn(account)
          .then(function (result) {
            if (! (result && result.halt)) {
              self.navigate('signup_complete');
            }
          });
      } else {
        self.navigate('confirm', {
          data: {
            account: account
          }
        });
      }
    },

    _suggestSignIn: function (err) {
      err.forceMessage = t('Account already exists. <a href="/signin">Sign in</a>');
      return this.displayErrorUnsafe(err);
    },

    _selectPrefillYear: function () {
      var prefillYear = this._formPrefill.get('year');
      if (prefillYear) {
        this.$('#fxa-' + prefillYear).attr('selected', 'selected');
      }
    }
  });

  Cocktail.mixin(
    View,
    PasswordMixin,
    ServiceMixin
  );

  return View;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// module to calculate screen dimentions given a window.

'use strict';

define([
], function () {
  var NOT_REPORTED_VALUE = 'none';

  function ScreenInfo(win) {
    function setSizeSettings () {
      // for more information:
      // http://quirksmode.org/mobile/viewports.html and
      // http://quirksmode.org/mobile/viewports2.html
      self.clientHeight = documentElement.clientHeight || NOT_REPORTED_VALUE;
      self.clientWidth = documentElement.clientWidth || NOT_REPORTED_VALUE;
      self.devicePixelRatio = win.devicePixelRatio || NOT_REPORTED_VALUE;
      self.screenHeight = screen.height || NOT_REPORTED_VALUE;
      self.screenWidth = screen.width || NOT_REPORTED_VALUE;
    }

    var self = this;
    var documentElement = win.document.documentElement || {};
    var screen = win.screen || {};
    setSizeSettings(screen);
  }

  return ScreenInfo;
});


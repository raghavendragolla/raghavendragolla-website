/**
 * Google Pomelli Redesign Preview — Isolated Interaction Script
 * Scope: Loaded exclusively by /redesign/index.html
 */
(function () {
  'use strict';

  // Mobile menu toggle
  var menuBtn = document.getElementById('mobileMenuBtn');
  var nav = document.querySelector('.site-nav');

  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var isExpanded = menuBtn.getAttribute('aria-expanded') === 'true';
      menuBtn.setAttribute('aria-expanded', String(!isExpanded));
      nav.classList.toggle('mobile-nav-active');
    });

    // Close menu on ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('mobile-nav-active')) {
        nav.classList.remove('mobile-nav-active');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.focus();
      }
    });

    // Close menu when clicking nav links
    var links = nav.querySelectorAll('.nav-link');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        if (nav.classList.contains('mobile-nav-active')) {
          nav.classList.remove('mobile-nav-active');
          menuBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }
})();


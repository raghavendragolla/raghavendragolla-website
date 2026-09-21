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

  // Smooth scroll for anchor links with offset
  var anchorLinks = document.querySelectorAll('a[href^="#"]');
  for (var j = 0; j < anchorLinks.length; j++) {
    anchorLinks[j].addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#' || targetId === '') return;
      var targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.history && window.history.pushState) {
          window.history.pushState(null, '', targetId);
        }
      }
    });
  }
})();

/**
 * Raghavendra Golla - Shared Core Utilities & System Modules
 * Features: Theme Manager, High-Performance Canvas, IST Clock, Toast, Modal A11y, PWA & SW
 */

(function () {
    'use strict';

    // Activate asynchronous non-critical stylesheets (CSP-compliant without inline event handlers)
    function activateAsyncStylesheets() {
        try {
            var asyncLinks = document.querySelectorAll('link[data-async-css]');
            for (var i = 0; i < asyncLinks.length; i++) {
                asyncLinks[i].media = 'all';
                asyncLinks[i].removeAttribute('data-async-css');
            }
        } catch (e) { }
    }
    activateAsyncStylesheets();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', activateAsyncStylesheets, { once: true });
    }

    // Reset scroll to (0, 0) on reload and restore 'auto' after load for native Back/Forward
    // Reset scroll to (0, 0) on reload ONLY if not navigating to a hash anchor
    try {
        var navEntries = performance.getEntriesByType('navigation');
        var isReload = navEntries && navEntries.length > 0 ? navEntries[0].type === 'reload' : (window.performance && window.performance.navigation && window.performance.navigation.type === 1);
        var hasValidHash = window.location.hash && window.location.hash.length > 1 && !window.location.hash.startsWith('#filter=');

        if (isReload && !hasValidHash) {
            if ('scrollRestoration' in history) {
                history.scrollRestoration = 'manual';
            }
            document.documentElement.style.scrollBehavior = 'auto';
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            if (document.body) {
                document.body.scrollTop = 0;
            }
            document.documentElement.style.scrollBehavior = '';

            window.addEventListener('load', function () {
                if (!window.location.hash || window.location.hash.startsWith('#filter=')) {
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                }
                setTimeout(function () {
                    if ('scrollRestoration' in history) {
                        history.scrollRestoration = 'auto';
                    }
                }, 100);
            }, { once: true });
        }

        function scrollToHashTarget() {
            var hash = window.location.hash;
            if (hash && hash.length > 1 && !hash.startsWith('#filter=')) {
                try {
                    var target = document.querySelector(hash);
                    if (target) {
                        target.scrollIntoView({ behavior: 'auto', block: 'start' });
                    }
                } catch (e) { }
            }
        }

        window.addEventListener('hashchange', scrollToHashTarget);
        if (hasValidHash) {
            if (document.readyState === 'loading') {
                window.addEventListener('load', scrollToHashTarget, { once: true });
            } else {
                scrollToHashTarget();
            }
        }
    } catch (e) { }

    // ====================================================
    // 1. Safe Storage Utilities (safely handle Private Mode)
    // ====================================================
    window.rgStorage = {
        getItem: function (key) {
            try {
                return localStorage.getItem(key);
            } catch (e) {
                return null;
            }
        },
        setItem: function (key, value) {
            try {
                localStorage.setItem(key, value);
            } catch (e) { }
        },
        removeItem: function (key) {
            try {
                localStorage.removeItem(key);
            } catch (e) { }
        }
    };

    // Harmonize legacy 'theme' storage key and canonical 'rg:theme' key
    try {
        var rgThemeVal = window.rgStorage.getItem('rg:theme');
        var legacyTheme = window.rgStorage.getItem('theme');
        if (rgThemeVal) {
            window.rgStorage.setItem('theme', rgThemeVal);
        } else if (legacyTheme) {
            window.rgStorage.setItem('rg:theme', legacyTheme);
        }
        localStorage.removeItem('cached_visits');
        sessionStorage.removeItem('visited_session');
        var legacyPwa = sessionStorage.getItem('pwa_prompt_dismissed');
        if (legacyPwa) {
            window.rgStorage.setItem('rg:pwa_dismissed', Date.now().toString());
            sessionStorage.removeItem('pwa_prompt_dismissed');
        }
    } catch (e) { }

    window.isPwaDismissed = function () {
        try {
            var val = window.rgStorage.getItem('rg:pwa_dismissed') || window.rgStorage.getItem('rg:pwa-dismissed');
            if (!val) {
                if (sessionStorage.getItem('pwa_prompt_dismissed') === 'true') return true;
                return false;
            }
            var dismissedAt = parseInt(val, 10);
            if (isNaN(dismissedAt)) return false;
            if (Date.now() - dismissedAt < 30 * 24 * 60 * 60 * 1000) {
                return true;
            }
            window.rgStorage.removeItem('rg:pwa_dismissed');
            window.rgStorage.removeItem('rg:pwa-dismissed');
            return false;
        } catch (e) {
            return false;
        }
    };

    window.dismissPwa = function () {
        try {
            var nowStr = Date.now().toString();
            window.rgStorage.setItem('rg:pwa_dismissed', nowStr);
            window.rgStorage.setItem('rg:pwa-dismissed', nowStr);
            sessionStorage.removeItem('pwa_prompt_dismissed');
        } catch (e) { }
    };

    // ====================================================
    // 2. Unified Theme System (Follows OS Preference)
    // ====================================================
    window.rgTheme = {
        getTheme: function () {
            return window.rgStorage.getItem('rg:theme') || window.rgStorage.getItem('theme');
        },
        init: function () {
            var saved = window.rgTheme.getTheme();
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (saved === 'dark' || (!saved && prefersDark)) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        },
        setTheme: function (next) {
            if (next === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
            window.rgStorage.setItem('rg:theme', next);
            window.rgStorage.setItem('theme', next);
            if (window.updateCanvasTheme) {
                window.updateCanvasTheme();
            }
            return next;
        },
        toggle: function () {
            var current = document.documentElement.getAttribute('data-theme');
            var next = current === 'dark' ? 'light' : 'dark';
            return window.rgTheme.setTheme(next);
        }
    };

    // Immediate Theme Apply (Zero-FOUC)
    window.rgTheme.init();

    // Listen for OS preference changes if no manual override is set
    try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
            if (!window.rgStorage.getItem('rg:theme')) {
                if (e.matches) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.removeAttribute('data-theme');
                }
            }
        });
    } catch (e) { }

    // ====================================================
    // 3. Shared Toast System
    // ====================================================
    var toastTimeout;
    window.showToast = function (message) {
        var toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            toast.innerHTML = '<span class="toast-icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></span><span class="toast-message"></span>';
            toast.addEventListener('click', function () {
                toast.classList.remove('show');
            });
            document.body.appendChild(toast);
        }

        var messageEl = toast.querySelector('.toast-message');
        if (messageEl) messageEl.textContent = message;

        clearTimeout(toastTimeout);
        toast.classList.remove('hide');
        toast.classList.add('show');

        toastTimeout = setTimeout(function () {
            toast.classList.remove('show');
        }, 2800);
    };

    // ====================================================
    // 4. Modal / Dialog Accessibility Helper
    // ====================================================
    window.setupAccessibleModal = function (modalElement, triggerElement, closeElements, options) {
        if (!modalElement) return;

        var lastFocusedElement = null;
        var focusTimer1 = null;
        var focusTimer2 = null;
        options = options || {};

        function openModal(customTrigger) {
            var triggerNode = (customTrigger && customTrigger.nodeType === 1) ? customTrigger : (triggerElement && triggerElement.nodeType === 1 ? triggerElement : (document.activeElement && document.activeElement !== document.body ? document.activeElement : null));
            lastFocusedElement = triggerNode;
            modalElement.setAttribute('aria-modal', 'true');
            modalElement.setAttribute('aria-hidden', 'false');
            modalElement.classList.add('active', 'open', 'show');
            document.body.classList.add('scroll-locked');
            if (typeof options.onOpen === 'function') {
                options.onOpen();
            }

            function focusFirst() {
                if (!modalElement.classList.contains('active') && !modalElement.classList.contains('open') && !modalElement.classList.contains('show')) return;
                if (modalElement.contains(document.activeElement)) return;
                var focusables = Array.prototype.slice.call(
                    modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                ).filter(function (el) {
                    return !el.disabled && el.offsetParent !== null && window.getComputedStyle(el).visibility !== 'hidden';
                });
                if (focusables.length > 0) {
                    try {
                        focusables[0].focus();
                    } catch (err) {}
                }
            }

            focusFirst();
            focusTimer1 = setTimeout(focusFirst, 50);
            focusTimer2 = setTimeout(focusFirst, 150);

            document.addEventListener('keydown', handleKeyDown);
        }

        function closeModal() {
            if (focusTimer1) clearTimeout(focusTimer1);
            if (focusTimer2) clearTimeout(focusTimer2);
            modalElement.removeAttribute('aria-modal');
            modalElement.setAttribute('aria-hidden', 'true');
            modalElement.classList.remove('active', 'open', 'show');
            document.body.classList.remove('scroll-locked', 'drawer-open');
            document.documentElement.classList.remove('scroll-locked', 'drawer-open');
            document.removeEventListener('keydown', handleKeyDown);

            if (typeof options.onClose === 'function') {
                options.onClose();
            }

            var returnTarget = (lastFocusedElement && typeof lastFocusedElement.focus === 'function') ? lastFocusedElement : ((triggerElement && typeof triggerElement.focus === 'function') ? triggerElement : null);
            if (returnTarget) {
                try {
                    returnTarget.focus();
                } catch (err) {}
            }
        }

        function handleKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
                return;
            }

            if (e.key === 'Tab') {
                var focusables = Array.prototype.slice.call(
                    modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                ).filter(function (el) {
                    return !el.disabled && el.offsetParent !== null && window.getComputedStyle(el).visibility !== 'hidden';
                });
                if (focusables.length === 0) {
                    e.preventDefault();
                    return;
                }

                var first = focusables[0];
                var last = focusables[focusables.length - 1];

                if (!modalElement.contains(document.activeElement)) {
                    first.focus();
                    e.preventDefault();
                    return;
                }

                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        last.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === last) {
                        first.focus();
                        e.preventDefault();
                    }
                }
            }
        }

        if (triggerElement) {
            triggerElement.addEventListener('click', openModal);
        }

        if (closeElements) {
            var closes = Array.isArray(closeElements) ? closeElements : [closeElements];
            closes.forEach(function (el) {
                if (el) el.addEventListener('click', closeModal);
            });
        }

        return {
            open: openModal,
            close: closeModal
        };
    };

    // SVG SMIL reduced-motion handler
    function handleReducedMotionSvg() {
        try {
            var mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            function updateSvg() {
                var svgs = document.querySelectorAll('svg');
                for (var i = 0; i < svgs.length; i++) {
                    if (mediaQuery.matches) {
                        if (typeof svgs[i].pauseAnimations === 'function') {
                            svgs[i].pauseAnimations();
                        }
                    } else {
                        if (typeof svgs[i].unpauseAnimations === 'function') {
                            svgs[i].unpauseAnimations();
                        }
                    }
                }
            }
            updateSvg();
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', updateSvg);
            }
        } catch (e) { }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleReducedMotionSvg, { once: true });
    } else {
        handleReducedMotionSvg();
    }


    // ====================================================
    // 6. Live IST Clock Helper
    // ====================================================
    var istClockInitialized = false;
    window.initISTClock = function () {
        if (istClockInitialized) return;
        var clockEl = document.getElementById('vitals-clock');
        if (!clockEl) return;
        istClockInitialized = true;
        window._istClockInitialized = true;

        var clockInterval = null;

        function updateClock() {
            try {
                var now = new Date();
                var options = {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                };
                var timeStr = new Intl.DateTimeFormat('en-US', options).format(now);
                clockEl.textContent = timeStr + ' IST';
            } catch (e) {
                clockEl.textContent = 'IST';
            }
        }

        updateClock();
        clockInterval = setInterval(updateClock, 1000);

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                if (clockInterval) clearInterval(clockInterval);
            } else {
                updateClock();
                if (clockInterval) clearInterval(clockInterval);
                clockInterval = setInterval(updateClock, 1000);
            }
        });
    };

    // ====================================================
    // 7. PWA Install & Service Worker Integration
    // ====================================================
    window.initPWA = function () {
        // Register Service Worker authoritatively once per lifecycle
        if ('serviceWorker' in navigator && !window._swRegistered) {
            window._swRegistered = true;
            var registerSW = function () {
                navigator.serviceWorker.register('/sw.js').catch(function (err) {
                    console.warn('SW registration failed:', err);
                });
            };
            if (document.readyState === 'complete') {
                registerSW();
            } else {
                window.addEventListener('load', registerSW);
            }
        }
    };

    // Theme toggle binder for pages with #theme-toggle (e.g. 404.html, index.html)
    window.initThemeToggle = function () {
        var themeToggleBtn = document.getElementById('theme-toggle');
        if (!themeToggleBtn || themeToggleBtn._rgBound) return;
        themeToggleBtn._rgBound = true;

        function updateUI(theme) {
            if (theme === 'dark') {
                themeToggleBtn.setAttribute('aria-label', 'Switch to Light Mode');
                themeToggleBtn.setAttribute('title', 'Switch to Light Mode');
            } else {
                themeToggleBtn.setAttribute('aria-label', 'Switch to Dark Mode');
                themeToggleBtn.setAttribute('title', 'Switch to Dark Mode');
            }
        }

        var current = document.documentElement.getAttribute('data-theme') || (window.rgTheme ? window.rgTheme.getTheme() : 'light');
        updateUI(current);

        themeToggleBtn.addEventListener('click', function () {
            var next = window.rgTheme ? window.rgTheme.toggle() : (document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
            updateUI(next);
        });
    };

    // DOMContentLoaded Initialization
    function initSharedModules() {
        window.initISTClock();
        window.initPWA();
        window.initThemeToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSharedModules);
    } else {
        initSharedModules();
    }

})();

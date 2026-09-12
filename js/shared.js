/**
 * Raghavendra Golla - Shared Core Utilities & System Modules
 * Features: Theme Manager, High-Performance Canvas, IST Clock, Toast, Modal A11y, PWA & SW
 */

(function () {
    'use strict';

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

    // Migrate legacy 'theme' storage key to 'rg:theme'
    try {
        var legacyTheme = localStorage.getItem('theme');
        if (legacyTheme) {
            window.rgStorage.setItem('rg:theme', legacyTheme);
            localStorage.removeItem('theme');
        }
    } catch (e) { }

    // ====================================================
    // 2. Unified Theme System (Follows OS Preference)
    // ====================================================
    window.rgTheme = {
        init: function () {
            var saved = window.rgStorage.getItem('rg:theme');
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (saved === 'dark' || (!saved && prefersDark)) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        },
        toggle: function () {
            var current = document.documentElement.getAttribute('data-theme');
            var next = current === 'dark' ? 'light' : 'dark';
            if (next === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
            window.rgStorage.setItem('rg:theme', next);
            return next;
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
    window.setupAccessibleModal = function (modalElement, triggerElement, closeElements) {
        if (!modalElement) return;

        var lastFocusedElement = null;

        function openModal() {
            lastFocusedElement = document.activeElement;
            modalElement.setAttribute('aria-modal', 'true');
            modalElement.classList.add('open', 'show');
            document.body.classList.add('scroll-locked');

            var focusable = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length > 0) {
                focusable[0].focus();
            }

            document.addEventListener('keydown', handleKeyDown);
        }

        function closeModal() {
            modalElement.removeAttribute('aria-modal');
            modalElement.classList.remove('open', 'show');
            document.body.classList.remove('scroll-locked');
            document.removeEventListener('keydown', handleKeyDown);

            if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
                lastFocusedElement.focus();
            }
        }

        function handleKeyDown(e) {
            if (e.key === 'Escape') {
                closeModal();
                return;
            }

            if (e.key === 'Tab') {
                var focusables = Array.prototype.slice.call(
                    modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                );
                if (focusables.length === 0) return;

                var first = focusables[0];
                var last = focusables[focusables.length - 1];

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

    // ====================================================
    // 5. Optimized High-Performance Neural Canvas System
    // ====================================================
    window.initNeuralCanvas = function () {
        var canvas = document.getElementById('neural-canvas');
        if (!canvas) return;

        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var width = 0;
        var height = 0;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var particles = [];
        var rafId = null;
        var isVisible = true;
        var lastFrameTime = 0;
        var targetFPS = 30;
        var frameInterval = 1000 / targetFPS;

        function resizeCanvas() {
            var rect = canvas.getBoundingClientRect();
            width = rect.width || window.innerWidth;
            height = rect.height || window.innerHeight;

            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);

            // Clamp particle positions to new canvas bounds
            particles.forEach(function (p) {
                if (p.x > width) p.x = Math.random() * width;
                if (p.y > height) p.y = Math.random() * height;
            });
        }

        var resizeTimeout;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(resizeCanvas, 150);
        });

        // Initialize Particles
        var particleCount = Math.min(Math.floor(window.innerWidth / 35), 45);
        particles = [];
        for (var i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * (window.innerWidth || 1000),
                y: Math.random() * (window.innerHeight || 800),
                vx: (Math.random() - 0.5) * 0.45,
                vy: (Math.random() - 0.5) * 0.45,
                radius: Math.random() * 1.5 + 1
            });
        }

        resizeCanvas();

        function renderFrame(timestamp) {
            if (!isVisible) return;

            rafId = requestAnimationFrame(renderFrame);

            var elapsed = timestamp - lastFrameTime;
            if (elapsed < frameInterval) return;
            lastFrameTime = timestamp - (elapsed % frameInterval);

            ctx.clearRect(0, 0, width, height);

            var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            var particleColor = isDark ? 'rgba(56, 189, 248, 0.45)' : 'rgba(47, 125, 120, 0.35)';
            var lineBaseColor = isDark ? '56, 189, 248' : '47, 125, 120';

            // Draw particles & links without expensive ctx.shadowBlur
            for (var a = 0; a < particles.length; a++) {
                var p = particles[a];
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = particleColor;
                ctx.fill();

                for (var b = a + 1; b < particles.length; b++) {
                    var p2 = particles[b];
                    var dx = p.x - p2.x;
                    var dy = p.y - p2.y;
                    var dist = dx * dx + dy * dy;

                    if (dist < 14400) { // 120px max link distance
                        var alpha = (1 - Math.sqrt(dist) / 120) * 0.22;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = 'rgba(' + lineBaseColor + ',' + alpha + ')';
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }
        }

        function startLoop() {
            if (!rafId && isVisible) {
                lastFrameTime = performance.now();
                rafId = requestAnimationFrame(renderFrame);
            }
        }

        function stopLoop() {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }

        // IntersectionObserver to pause loop when scrolled out of view
        try {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    isVisible = entry.isIntersecting;
                    if (isVisible) {
                        startLoop();
                    } else {
                        stopLoop();
                    }
                });
            }, { threshold: 0.05 });
            observer.observe(canvas);
        } catch (e) { }

        // Visibilitychange listener
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                isVisible = false;
                stopLoop();
            } else {
                isVisible = true;
                startLoop();
            }
        });

        startLoop();
    };

    // ====================================================
    // 6. Live IST Clock Helper
    // ====================================================
    window.initISTClock = function () {
        var clockEl = document.getElementById('vitals-clock');
        if (!clockEl) return;

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
        // Register Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function (err) {
                    console.warn('SW registration failed:', err);
                });
            });
        }

        // PWA Install Prompt handling with 30-day localStorage expiry
        var deferredPrompt = null;
        var pwaBanner = document.getElementById('pwa-install-banner');
        var installBtn = document.getElementById('pwa-install-btn');
        var dismissBtn = document.getElementById('pwa-dismiss-btn');

        if (!pwaBanner) return;

        var dismissedTime = window.rgStorage.getItem('rg:pwa-dismissed');
        var now = Date.now();
        if (dismissedTime && (now - parseInt(dismissedTime, 10) < 30 * 24 * 60 * 60 * 1000)) {
            return; // Dismissed within 30 days
        }

        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferredPrompt = e;
            pwaBanner.classList.add('show');
        });

        if (installBtn) {
            installBtn.addEventListener('click', function () {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(function () {
                        deferredPrompt = null;
                        pwaBanner.classList.remove('show');
                    });
                }
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                pwaBanner.classList.remove('show');
                window.rgStorage.setItem('rg:pwa-dismissed', Date.now().toString());
            });
        }
    };

    // DOMContentLoaded Initialization
    document.addEventListener('DOMContentLoaded', function () {
        window.initNeuralCanvas();
        window.initISTClock();
        window.initPWA();
    });

})();

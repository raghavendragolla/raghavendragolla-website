/**
 * Raghavendra Golla - Personal Portfolio Dynamic Engine
 * Features:
 * 1. Theme Management (Light / Dark)
 * 2. Interactive Neural Particle Node Canvas (60fps, touch & mouse responsive)
 * 3. Dynamic Rotating Headline Text
 * 4. Animated Metric Number Count-Up (on load)
 * 5. 3D Magnetic Tilt & Specular Sheen for Highlight Cards
 * 6. Interactive Skill Matrix linked with Highlight Cards
 * 7. Live System Heartbeat (ECG BPM)
 * 8. Interactive Toast Notifications & CTA Handlers
 */

document.addEventListener('DOMContentLoaded', () => {

    // ====================================================
    // 1. Theme Management (Light / Dark Mode)
    // ====================================================
    const themeToggleBtn = document.getElementById('theme-toggle');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    function getSavedTheme() {
        return localStorage.getItem('theme');
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (themeToggleBtn) {
                themeToggleBtn.setAttribute('aria-label', 'Switch to Light Mode');
                themeToggleBtn.setAttribute('title', 'Switch to Light Mode');
            }
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeToggleBtn) {
                themeToggleBtn.setAttribute('aria-label', 'Switch to Dark Mode');
                themeToggleBtn.setAttribute('title', 'Switch to Dark Mode');
            }
        }
        // Notify canvas to re-read theme colors
        if (window.updateCanvasTheme) {
            window.updateCanvasTheme();
        }
    }

    // Initialize Theme
    const savedTheme = getSavedTheme();
    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (systemPrefersDark.matches) {
        applyTheme('dark');
    }

    systemPrefersDark.addEventListener('change', (e) => {
        if (!getSavedTheme()) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }


    // ====================================================
    // 2. Interactive Neural Particle Node Canvas
    // ====================================================
    const canvas = document.getElementById('neural-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];
        const isMobile = window.innerWidth <= 768;
        const particleCount = isMobile ? 32 : 65;
        const maxDistance = isMobile ? 95 : 140;

        let mouse = {
            x: null,
            y: null,
            radius: isMobile ? 100 : 160
        };

        function resizeCanvas() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Track fine pointer mouse position for node attraction
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            window.addEventListener('mousemove', (e) => {
                mouse.x = e.clientX;
                mouse.y = e.clientY;
            });

            window.addEventListener('mouseleave', () => {
                mouse.x = null;
                mouse.y = null;
            });
        }

        // Particle Class
        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.55;
                this.vy = (Math.random() - 0.5) * 0.55;
                this.radius = Math.random() * 1.8 + 1;
                this.colorType = Math.random() > 0.3 ? 'teal' : 'gold';
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                // Screen boundaries bounce
                if (this.x < 0 || this.x > width) this.vx = -this.vx;
                if (this.y < 0 || this.y > height) this.vy = -this.vy;

                // Mouse interaction / gravity
                if (mouse.x !== null && mouse.y !== null) {
                    const dx = mouse.x - this.x;
                    const dy = mouse.y - this.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance < mouse.radius) {
                        const force = (mouse.radius - distance) / mouse.radius;
                        this.x += (dx / distance) * force * 1.2;
                        this.y += (dy / distance) * force * 1.2;
                    }
                }
            }

            draw(tealRgb, goldRgb) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = this.colorType === 'teal' 
                    ? `rgba(${tealRgb}, 0.7)` 
                    : `rgba(${goldRgb}, 0.75)`;
                ctx.fill();
            }
        }

        // Initialize particles
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }

        let tealRgb = '47, 125, 120';
        let goldRgb = '184, 144, 47';

        window.updateCanvasTheme = function() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            tealRgb = isDark ? '66, 179, 171' : '47, 125, 120';
            goldRgb = isDark ? '212, 167, 66' : '184, 144, 47';
        };

        window.updateCanvasTheme();

        let waveTime = 0;

        function drawQuantumWave(time, isDark) {
            // Positioned elegantly below the headline in the lower-mid atmosphere
            const centerY = height * 0.58;
            const pulseCenter = width * 0.50;
            const pulseSpread = isMobile ? width * 0.36 : width * 0.28;
            const step = isMobile ? 6 : 3;

            // 1. Subtle Ambient Data Matrix Dust (Faint Stardust Equalizer)
            const eqColumns = isMobile ? 20 : 36;
            const colSpacing = width / eqColumns;
            ctx.save();
            for (let i = 0; i < eqColumns; i++) {
                const colX = i * colSpacing + colSpacing * 0.5;
                const distFromPulse = Math.abs(colX - pulseCenter);
                const colEnv = Math.exp(-Math.pow(distFromPulse / (pulseSpread * 1.4), 2));

                if (colEnv > 0.12) {
                    const colHeight = (isMobile ? 45 : 75) * colEnv * (0.5 + 0.5 * Math.sin(i * 0.9 + time * 0.04));
                    const dotCount = Math.floor(colHeight / 14);

                    for (let d = 0; d < dotCount; d++) {
                        const dotY = centerY - colHeight * 0.5 + d * 14;
                        const alpha = colEnv * (isDark ? 0.08 : 0.07) * (1 - d / dotCount);
                        ctx.fillStyle = isDark 
                            ? (i % 2 === 0 ? `rgba(0, 242, 254, ${alpha})` : `rgba(245, 158, 11, ${alpha})`)
                            : (i % 2 === 0 ? `rgba(13, 148, 136, ${alpha})` : `rgba(217, 119, 6, ${alpha})`);
                        ctx.fillRect(colX - 1, dotY - 1, 2, 2);
                    }
                }
            }
            ctx.restore();

            // 2. The "Ghost" Multi-Harmonic Silk Wave Ribbons
            const waveRibbons = isDark ? [
                // Cyan Ghost Ribbon (Soft atmospheric depth)
                {
                    color: 'rgba(0, 242, 254, 0.18)',
                    glow: 'rgba(0, 242, 254, 0.08)',
                    blur: 8,
                    width: 1.4,
                    peakAmp: isMobile ? 28 : 42,
                    freq1: 0.008,
                    freq2: 0.018,
                    speed: 0.018,
                    phase: 0
                },
                // Gold / Amber Ghost Ribbon
                {
                    color: 'rgba(251, 191, 36, 0.15)',
                    glow: 'rgba(245, 158, 11, 0.07)',
                    blur: 7,
                    width: 1.2,
                    peakAmp: isMobile ? 24 : 36,
                    freq1: 0.007,
                    freq2: 0.016,
                    speed: -0.015,
                    phase: 1.6
                },
                // Electric Violet Accent
                {
                    color: 'rgba(168, 85, 247, 0.12)',
                    glow: 'rgba(168, 85, 247, 0.05)',
                    blur: 6,
                    width: 1.0,
                    peakAmp: isMobile ? 18 : 26,
                    freq1: 0.009,
                    freq2: 0.022,
                    speed: 0.012,
                    phase: 3.2
                }
            ] : [
                // Light Mode Pearlescent Watercolor Silk Waves (Zero Scribble / Zero Strikethrough)
                {
                    color: 'rgba(13, 148, 136, 0.16)',
                    glow: 'rgba(13, 148, 136, 0.06)',
                    blur: 6,
                    width: 1.4,
                    peakAmp: isMobile ? 24 : 36,
                    freq1: 0.008,
                    freq2: 0.018,
                    speed: 0.016,
                    phase: 0
                },
                {
                    color: 'rgba(217, 119, 6, 0.13)',
                    glow: 'rgba(217, 119, 6, 0.05)',
                    blur: 5,
                    width: 1.2,
                    peakAmp: isMobile ? 20 : 30,
                    freq1: 0.007,
                    freq2: 0.016,
                    speed: -0.014,
                    phase: 1.6
                },
                {
                    color: 'rgba(168, 85, 247, 0.11)',
                    glow: 'rgba(168, 85, 247, 0.04)',
                    blur: 4,
                    width: 1.0,
                    peakAmp: isMobile ? 16 : 24,
                    freq1: 0.009,
                    freq2: 0.022,
                    speed: 0.010,
                    phase: 3.2
                }
            ];

            waveRibbons.forEach(ribbon => {
                ctx.save();
                ctx.beginPath();

                ctx.strokeStyle = ribbon.color;
                ctx.lineWidth = ribbon.width;
                ctx.shadowColor = ribbon.glow;
                ctx.shadowBlur = ribbon.blur;

                for (let x = 0; x <= width; x += step) {
                    const dx = (x - pulseCenter) / pulseSpread;
                    const gaussian = Math.exp(-Math.pow(dx, 2));

                    const harmonic1 = Math.sin(x * ribbon.freq1 + time * ribbon.speed + ribbon.phase);
                    const harmonic2 = Math.sin(x * ribbon.freq2 - time * (ribbon.speed * 1.3) + ribbon.phase * 1.4) * 0.5;

                    const totalOsc = (harmonic1 + harmonic2);
                    let y = centerY + totalOsc * ribbon.peakAmp * (0.35 + 0.65 * gaussian);

                    // Gentle subtle ripple from cursor
                    if (mouse.x !== null && mouse.y !== null) {
                        const mouseDist = Math.hypot(x - mouse.x, centerY - mouse.y);
                        if (mouseDist < 200) {
                            const mouseForce = (1 - mouseDist / 200) * (ribbon.peakAmp * 0.4);
                            y += Math.sin(mouseDist * 0.04 - time * 0.05) * mouseForce;
                        }
                    }

                    if (x === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
                ctx.restore();
            });
        }

        function animateCanvas() {
            ctx.clearRect(0, 0, width, height);

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            waveTime += 1;

            // 1. Draw Quantum Neural Data Waveform
            drawQuantumWave(waveTime, isDark);

            // 2. Connect nearby nodes with neural lines
            for (let a = 0; a < particles.length; a++) {
                for (let b = a + 1; b < particles.length; b++) {
                    const dx = particles[a].x - particles[b].x;
                    const dy = particles[a].y - particles[b].y;
                    const dist = Math.hypot(dx, dy);

                    if (dist < maxDistance) {
                        const alpha = (1 - dist / maxDistance) * 0.28;
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(${tealRgb}, ${alpha})`;
                        ctx.lineWidth = 0.9;
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(particles[b].x, particles[b].y);
                        ctx.stroke();
                    }
                }
            }

            // 3. Draw and update each particle
            particles.forEach(p => {
                p.update();
                p.draw(tealRgb, goldRgb);
            });

            requestAnimationFrame(animateCanvas);
        }

        animateCanvas();
    }


    // ====================================================
    // 3. Dynamic Rotating Headline Text
    // ====================================================
    const dynamicTextEl = document.getElementById('dynamic-text');
    if (dynamicTextEl) {
        const phrases = [
            'intelligent solutions.',
            'predictive models.',
            'actionable insights.',
            'scalable AI systems.',
            'practical ML apps.'
        ];

        let currentIndex = 0;

        setInterval(() => {
            dynamicTextEl.classList.add('swapping');

            setTimeout(() => {
                currentIndex = (currentIndex + 1) % phrases.length;
                dynamicTextEl.textContent = phrases[currentIndex];
                dynamicTextEl.classList.remove('swapping');
            }, 320);
        }, 3400);
    }


    // ====================================================
    // 4. Animated Metric Number Count-Up (on Load)
    // ====================================================
    const metricElements = document.querySelectorAll('.spec-number[data-count]');

    function animateCountUp() {
        metricElements.forEach(el => {
            const target = parseFloat(el.getAttribute('data-count'));
            const suffix = el.getAttribute('data-suffix') || '';
            const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
            const duration = 1800; // ms
            const startTime = performance.now();

            function updateCounter(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease out cubic: 1 - pow(1 - progress, 3)
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentVal = (target * easeOut).toFixed(decimals);

                el.textContent = currentVal + suffix;

                if (progress < 1) {
                    requestAnimationFrame(updateCounter);
                } else {
                    el.textContent = (decimals > 0 ? target.toFixed(decimals) : target) + suffix;
                }
            }

            requestAnimationFrame(updateCounter);
        });
    }

    // Trigger Count Up Animation after page fade-in
    setTimeout(animateCountUp, 350);


    // ====================================================
    // 5. 3D Magnetic Tilt & Specular Sheen for Highlight Cards
    // ====================================================
    const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const highlightCards = document.querySelectorAll('.highlight-card');
    const glow1 = document.querySelector('.ambient-glow-1');
    const glow2 = document.querySelector('.ambient-glow-2');

    if (isFinePointer) {
        // Parallax background orbs
        window.addEventListener('mousemove', (e) => {
            const moveX = (e.clientX - window.innerWidth / 2) * 0.035;
            const moveY = (e.clientY - window.innerHeight / 2) * 0.035;

            if (glow1) glow1.style.transform = `translate(${moveX}px, ${moveY}px)`;
            if (glow2) glow2.style.transform = `translate(${-moveX}px, ${-moveY}px)`;
        });

        // 3D Tilt for Highlight Cards
        highlightCards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Card spotlight coordinates
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);

                // 3D Rotation Angles
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -7;
                const rotateY = ((x - centerX) / centerX) * 7;

                card.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-6px) scale3d(1.02, 1.02, 1.02)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = `perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px) scale3d(1, 1, 1)`;
            });
        });
    }


    // ====================================================
    // 6. Interactive Skill Matrix (Universal Click & Auto Deselect)
    // ====================================================
    const skillChips = document.querySelectorAll('.skill-chip');
    let skillAutoResetTimeout;

    function deselectAllSkills() {
        skillChips.forEach(c => c.classList.remove('active'));
        highlightCards.forEach(card => card.classList.remove('active-highlight'));
        clearTimeout(skillAutoResetTimeout);
        hideToast();
    }

    skillChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            const category = chip.getAttribute('data-category');
            const info = chip.getAttribute('data-info') || chip.textContent.trim();
            const isAlreadyActive = chip.classList.contains('active');

            if (isAlreadyActive) {
                // Clicking the active skill immediately deselects it
                deselectAllSkills();
            } else {
                // Clear any previous active states
                skillChips.forEach(c => c.classList.remove('active'));
                highlightCards.forEach(card => card.classList.remove('active-highlight'));
                clearTimeout(skillAutoResetTimeout);

                // Activate clicked chip
                chip.classList.add('active');

                // Pulse corresponding card
                highlightCards.forEach(card => {
                    if (card.getAttribute('data-category') === category) {
                        card.classList.add('active-highlight');
                    }
                });

                // Display descriptive toast
                showToast(info);

                // Auto-deselect back to normal after 2.5s
                skillAutoResetTimeout = setTimeout(() => {
                    skillChips.forEach(c => c.classList.remove('active'));
                    highlightCards.forEach(card => card.classList.remove('active-highlight'));
                }, 2500);
            }
        });
    });

    // Clicking anywhere on the screen (outside skill chips) immediately deselects
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.skill-chip')) {
            deselectAllSkills();
        }
    }, true);


    // ====================================================
    // 7. Live Real-Time Clock & Availability Ticker (IST)
    // ====================================================
    const clockEl = document.getElementById('vitals-clock');
    function updateClock() {
        if (!clockEl) return;
        const now = new Date();
        const options = {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        const timeString = new Intl.DateTimeFormat('en-US', options).format(now);
        clockEl.textContent = `${timeString} IST`;
    }

    if (clockEl) {
        updateClock();
        setInterval(updateClock, 1000);
    }


    // ====================================================
    // 8. Toast Notification & CTA Handlers
    // ====================================================
    let toastTimeout;

    function hideToast() {
        const toast = document.getElementById('toast');
        if (toast && toast.classList.contains('show')) {
            clearTimeout(toastTimeout);
            toast.classList.remove('show');
            toast.classList.add('hide');
        }
    }

    function showToast(message) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            toast.innerHTML = `
                <span class="toast-icon">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </span>
                <span class="toast-message"></span>
            `;
            // Clicking toast directly closes it immediately
            toast.addEventListener('click', hideToast);
            document.body.appendChild(toast);
        }

        const messageEl = toast.querySelector('.toast-message');
        if (messageEl) messageEl.textContent = message;

        clearTimeout(toastTimeout);
        toast.classList.remove('hide');
        toast.classList.add('show');

        toastTimeout = setTimeout(() => {
            hideToast();
        }, 2800);
    }

    const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
    emailLinks.forEach(emailLink => {
        emailLink.addEventListener('click', () => {
            showToast('Opening default email app...');
        });
    });

    // Dynamic Footer Copyright Year
    const footerYearEl = document.getElementById('footer-year');
    if (footerYearEl) {
        footerYearEl.textContent = new Date().getFullYear();
    }

    // ====================================================
    // 9. Real-Time Global Cloud Visitor Counter
    // ====================================================
    const visitorCountEl = document.getElementById('visitor-count');
    if (visitorCountEl) {
        const namespace = 'raghavendragolla_com';
        const key = 'visits';
        const baseOffset = 1420; // Base launch visits

        function animateCount(start, end) {
            const duration = 1500;
            const startTime = performance.now();
            function update(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const current = Math.floor(start + (end - start) * easeOut);
                visitorCountEl.textContent = current.toLocaleString();
                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    visitorCountEl.textContent = end.toLocaleString();
                }
            }
            requestAnimationFrame(update);
        }

        // Prevent spamming the counter within the same session
        const hasCountedSession = sessionStorage.getItem('visited_session');
        const apiAction = hasCountedSession ? '' : '/up';

        // Connect to Real Global Cloud Counter API
        fetch(`https://api.counterapi.dev/v1/${namespace}/${key}${apiAction}`)
            .then(res => res.json())
            .then(data => {
                if (data && typeof data.count === 'number') {
                    if (!hasCountedSession) {
                        sessionStorage.setItem('visited_session', 'true');
                    }
                    const totalRealVisits = baseOffset + data.count;
                    localStorage.setItem('cached_visits', totalRealVisits.toString());
                    animateCount(Math.max(1000, totalRealVisits - 35), totalRealVisits);
                } else {
                    throw new Error('Invalid counter response');
                }
            })
            .catch(() => {
                // Graceful fallback from cache or baseline
                let cached = parseInt(localStorage.getItem('cached_visits') || '1420', 10);
                if (!hasCountedSession) {
                    cached += 1;
                    localStorage.setItem('cached_visits', cached.toString());
                    sessionStorage.setItem('visited_session', 'true');
                }
                animateCount(Math.max(1000, cached - 25), cached);
            });
    }

    // ====================================================
    // 10. My Thoughts & Intelligence Hub Controller
    // ====================================================
    const thoughtsToggleBtn = document.getElementById('thoughts-toggle-btn');
    const thoughtsFooterBtn = document.getElementById('thoughts-footer-btn');
    const thoughtsDrawer = document.getElementById('thoughtsDrawer');
    const closeThoughtsBtn = document.getElementById('closeThoughtsBtn');
    const closeThoughtsBackdrop = document.getElementById('closeThoughtsBackdrop');
    const hubTabs = document.querySelectorAll('.hub-tab');
    const hubPanes = document.querySelectorAll('.hub-pane');

    function openThoughtsHub() {
        if (thoughtsDrawer) {
            thoughtsDrawer.classList.add('active');
            thoughtsDrawer.setAttribute('aria-hidden', 'false');
            document.documentElement.classList.add('drawer-open');
            document.body.classList.add('drawer-open');
        }
    }

    function closeThoughtsHub() {
        if (thoughtsDrawer) {
            thoughtsDrawer.classList.remove('active');
            thoughtsDrawer.setAttribute('aria-hidden', 'true');
            document.documentElement.classList.remove('drawer-open');
            document.body.classList.remove('drawer-open');
        }
    }

    if (thoughtsToggleBtn) {
        thoughtsToggleBtn.addEventListener('click', openThoughtsHub);
    }
    if (thoughtsFooterBtn) {
        thoughtsFooterBtn.addEventListener('click', openThoughtsHub);
    }
    if (closeThoughtsBtn) {
        closeThoughtsBtn.addEventListener('click', closeThoughtsHub);
    }
    if (closeThoughtsBackdrop) {
        closeThoughtsBackdrop.addEventListener('click', closeThoughtsHub);
        // Prevent wheel or touch events on the backdrop from reaching background document
        closeThoughtsBackdrop.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
        closeThoughtsBackdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    }

    // Keyboard ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && thoughtsDrawer && thoughtsDrawer.classList.contains('active')) {
            closeThoughtsHub();
        }
    });

    // Tab Switching Logic
    hubTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            hubTabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            hubPanes.forEach(pane => pane.classList.remove('active'));

            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            const targetPane = document.getElementById(`pane-${targetTab}`);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });

    // ====================================================
    // 11. Service Worker Registration (PWA Install Support)
    // ====================================================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }

    // ====================================================
    // 12. PWA Install Prompt Banner Controller
    // ====================================================
    let deferredPWAInstallPrompt = null;
    const pwaInstallBanner = document.getElementById('pwa-install-banner');
    const pwaInstallBtn = document.getElementById('pwa-install-btn');
    const pwaDismissBtn = document.getElementById('pwa-dismiss-btn');

    const isAppStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isMobileDevice = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) || (window.innerWidth <= 768);

    function displayInstallBanner() {
        if (!pwaInstallBanner || isAppStandalone) return;
        if (sessionStorage.getItem('pwa_prompt_dismissed') === 'true') return;

        pwaInstallBanner.style.display = 'flex';
        void pwaInstallBanner.offsetWidth;
        pwaInstallBanner.classList.add('show');
    }

    // Capture standard PWA install prompt (Chrome / Android / Chromium)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPWAInstallPrompt = e;
        setTimeout(displayInstallBanner, 1500);
    });

    // Mobile automatic display after slight delay
    if (isMobileDevice && !isAppStandalone) {
        setTimeout(displayInstallBanner, 2200);
    }

    if (pwaInstallBtn) {
        pwaInstallBtn.addEventListener('click', async () => {
            if (deferredPWAInstallPrompt) {
                deferredPWAInstallPrompt.prompt();
                const choiceResult = await deferredPWAInstallPrompt.userChoice;
                if (choiceResult && choiceResult.outcome === 'accepted') {
                    showToast('🎉 Thank you for installing!');
                }
                deferredPWAInstallPrompt = null;
                if (pwaInstallBanner) {
                    pwaInstallBanner.classList.remove('show');
                    setTimeout(() => { pwaInstallBanner.style.display = 'none'; }, 300);
                }
            } else {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if (isIOS) {
                    showToast('📲 Tap Share ⎙ and select "Add to Home Screen"');
                } else {
                    showToast('📲 Tap browser menu (⋮) -> "Install App" or "Add to Home Screen"');
                }
                if (pwaInstallBanner) {
                    pwaInstallBanner.classList.remove('show');
                    setTimeout(() => { pwaInstallBanner.style.display = 'none'; }, 300);
                }
            }
        });
    }

    if (pwaDismissBtn && pwaInstallBanner) {
        pwaDismissBtn.addEventListener('click', () => {
            pwaInstallBanner.classList.remove('show');
            setTimeout(() => { pwaInstallBanner.style.display = 'none'; }, 300);
            sessionStorage.setItem('pwa_prompt_dismissed', 'true');
        });
    }

    window.addEventListener('appinstalled', () => {
        if (pwaInstallBanner) {
            pwaInstallBanner.classList.remove('show');
            pwaInstallBanner.style.display = 'none';
        }
        showToast('✓ App installed successfully! 🎉');
    });
});


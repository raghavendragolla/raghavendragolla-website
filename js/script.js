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

        function animateCanvas() {
            ctx.clearRect(0, 0, width, height);

            // Connect nearby nodes with neural lines
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

            // Draw and update each particle
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

    const enterBtn = document.querySelector('.enter');
    if (enterBtn) {
        enterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Portfolio is coming soon! Stay tuned.');
        });
    }

    // Dynamic Footer Copyright Year
    const footerYearEl = document.getElementById('footer-year');
    if (footerYearEl) {
        footerYearEl.textContent = new Date().getFullYear();
    }
});

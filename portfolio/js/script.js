/**
 * Raghavendra Golla - Portfolio Dynamic Engine
 * Core Features:
 * 1. Theme Manager (Light & Dark mode with localStorage & System sync)
 * 2. 60FPS Interactive Neural Particle Node Canvas
 * 3. Live Indian Standard Time (IST) Real-time Clock
 * 4. Dynamic Rotating Headline Subtext
 * 5. Animated Metric Number Count-Up on Scroll
 * 6. 3D Magnetic Card Tilt & Specular Light Hover Effects
 * 7. Interactive Project Category Filter Tabs
 * 8. Interactive Toast Notifications & Clipboard Copy
 * 9. Scrollspy Navigation Highlighting
 * 10. Mobile Menu Drawer Controller
 */

document.addEventListener('DOMContentLoaded', () => {

    // ====================================================
    // 1. Theme Management (Light / Dark Mode)
    // ====================================================
    const sidebarThemeToggle = document.getElementById('theme-toggle-sidebar');
    const mobileThemeToggle = document.getElementById('theme-toggle-mobile');

    function toggleTheme() {
        const nextTheme = window.rgTheme ? window.rgTheme.toggle() : (document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
        showToast(nextTheme === 'dark' ? 'Switched to Dark Mode 🌙' : 'Switched to Light Mode ☀️');

        // Trigger 360-degree spin animation on theme toggle buttons
        [sidebarThemeToggle, mobileThemeToggle].forEach(btn => {
            if (btn) {
                btn.classList.add('theme-spinning');
                setTimeout(() => btn.classList.remove('theme-spinning'), 650);
            }
        });
    }

    if (sidebarThemeToggle) sidebarThemeToggle.addEventListener('click', toggleTheme);
    if (mobileThemeToggle) mobileThemeToggle.addEventListener('click', toggleTheme);


    // Helper: Defer non-critical execution to requestIdleCallback with load+timeout fallback
    function deferToIdleOrLoad(fn, fallbackDelay = 1500) {
        let executed = false;
        function run() {
            if (executed) return;
            executed = true;
            fn();
        }

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(run, { timeout: fallbackDelay });
        } else {
            if (document.readyState === 'complete') {
                setTimeout(run, fallbackDelay);
            } else {
                window.addEventListener('load', () => setTimeout(run, fallbackDelay), { once: true });
            }
        }
    }

    // ====================================================
    // 2. Interactive Neural Particle Node Canvas
    // ====================================================
    let canvasInitialized = false;

    function initCanvas() {
        if (canvasInitialized) return;
        const canvas = document.getElementById('neural-canvas');
        if (!canvas) return;
        canvasInitialized = true;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width, height;
        let particles = [];
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const particleCount = isMobile ? 18 : 36;
        const maxDistance = isMobile ? 80 : 120;

        let mouse = {
            x: null,
            y: null,
            radius: isMobile ? 100 : 160
        };

        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        function resizeCanvas() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Clamp particle positions into new bounds after shrink
            particles.forEach(p => {
                if (p.x > width) p.x = Math.random() * width;
                if (p.y > height) p.y = Math.random() * height;
            });
        }

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(resizeCanvas, 150);
        });

        resizeCanvas();

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

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.radius = Math.random() * 1.8 + 1;
                this.colorType = Math.random() > 0.3 ? 'teal' : 'gold';
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > width) this.vx = -this.vx;
                if (this.y < 0 || this.y > height) this.vy = -this.vy;

                if (mouse.x !== null && mouse.y !== null) {
                    const dx = mouse.x - this.x;
                    const dy = mouse.y - this.y;
                    const dist = Math.hypot(dx, dy);

                    if (dist > 0.001 && dist < mouse.radius) {
                        const force = (mouse.radius - dist) / mouse.radius;
                        this.x += (dx / dist) * force * 1.1;
                        this.y += (dy / dist) * force * 1.1;
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

        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }

        let tealRgb = '47, 125, 120';
        let goldRgb = '184, 144, 47';

        window.updateCanvasTheme = function() {
            const style = getComputedStyle(document.documentElement);
            tealRgb = (style.getPropertyValue('--canvas-particle-teal') || '45, 212, 191').trim();
            goldRgb = (style.getPropertyValue('--canvas-particle-gold') || '251, 191, 36').trim();
        };

        window.updateCanvasTheme();

        let isPageVisible = !document.hidden;
        let animFrameId = null;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

        function renderStaticFrame() {
            ctx.clearRect(0, 0, width, height);
            for (let a = 0; a < particles.length; a++) {
                for (let b = a + 1; b < particles.length; b++) {
                    const dx = particles[a].x - particles[b].x;
                    const dy = particles[a].y - particles[b].y;
                    const dist = Math.hypot(dx, dy);

                    if (dist < maxDistance) {
                        const alpha = (1 - dist / maxDistance) * 0.25;
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(${tealRgb}, ${alpha})`;
                        ctx.lineWidth = 0.85;
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(particles[b].x, particles[b].y);
                        ctx.stroke();
                    }
                }
            }
            particles.forEach(p => p.draw(tealRgb, goldRgb));
        }

        function animateCanvas() {
            if (!isPageVisible || prefersReducedMotion.matches) {
                animFrameId = null;
                return;
            }

            ctx.clearRect(0, 0, width, height);

            for (let a = 0; a < particles.length; a++) {
                for (let b = a + 1; b < particles.length; b++) {
                    const dx = particles[a].x - particles[b].x;
                    const dy = particles[a].y - particles[b].y;
                    const dist = Math.hypot(dx, dy);

                    if (dist < maxDistance) {
                        const alpha = (1 - dist / maxDistance) * 0.25;
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(${tealRgb}, ${alpha})`;
                        ctx.lineWidth = 0.85;
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(particles[b].x, particles[b].y);
                        ctx.stroke();
                    }
                }
            }

            particles.forEach(p => {
                p.update();
                p.draw(tealRgb, goldRgb);
            });

            animFrameId = requestAnimationFrame(animateCanvas);
        }

        function startAnimation() {
            if (prefersReducedMotion.matches) {
                renderStaticFrame();
                return;
            }
            if (!animFrameId && isPageVisible) {
                animFrameId = requestAnimationFrame(animateCanvas);
            }
        }

        function stopAnimation() {
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
        }

        document.addEventListener('visibilitychange', () => {
            isPageVisible = !document.hidden;
            if (isPageVisible) {
                startAnimation();
            } else {
                stopAnimation();
            }
        });

        window.addEventListener('pagehide', () => {
            isPageVisible = false;
            stopAnimation();
        });

        if (prefersReducedMotion.addEventListener) {
            prefersReducedMotion.addEventListener('change', () => {
                if (prefersReducedMotion.matches) {
                    stopAnimation();
                    renderStaticFrame();
                } else {
                    startAnimation();
                }
            });
        }

        startAnimation();
    }

    deferToIdleOrLoad(initCanvas, 1500);


    // ====================================================
    // 3. Real-Time IST Clock
    // ====================================================
    if (window.initISTClock) {
        window.initISTClock();
    }


    // ====================================================
    // 4. Dynamic Rotating Headline Text
    // ====================================================
    const dynamicTextEl = document.getElementById('dynamic-text');
    if (dynamicTextEl) {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        const phrases = [
            'actionable analytics & insights.',
            'high-impact business intelligence.',
            'intelligent, data-driven solutions.',
            'predictive machine learning models.',
            'interpretable clinical AI systems.'
        ];

        let currentIndex = 0;
        let rotateInterval = null;

        function startRotation() {
            if (prefersReduced.matches || rotateInterval) return;
            rotateInterval = setInterval(() => {
                dynamicTextEl.classList.add('swapping');

                setTimeout(() => {
                    currentIndex = (currentIndex + 1) % phrases.length;
                    dynamicTextEl.textContent = phrases[currentIndex];
                    dynamicTextEl.classList.remove('swapping');
                }, 300);
            }, 3600);
        }

        function stopRotation() {
            if (rotateInterval) {
                clearInterval(rotateInterval);
                rotateInterval = null;
            }
        }

        if (!prefersReduced.matches) {
            startRotation();
        }

        if (prefersReduced.addEventListener) {
            prefersReduced.addEventListener('change', (e) => {
                if (e.matches) {
                    stopRotation();
                    dynamicTextEl.textContent = phrases[0];
                    dynamicTextEl.classList.remove('swapping');
                } else {
                    startRotation();
                }
            });
        }
    }


    // ====================================================
    // 5. Animated Metric Numbers on Scroll
    // ====================================================
    const metricElements = document.querySelectorAll('.stat-number[data-count]');
    let animatedMetrics = false;

    function animateCountUp() {
        if (animatedMetrics) return;
        animatedMetrics = true;

        metricElements.forEach(el => {
            const target = parseFloat(el.getAttribute('data-count'));
            const suffix = el.getAttribute('data-suffix') || '';
            const prefix = el.getAttribute('data-prefix') || '';
            const duration = 1800;
            const startTime = performance.now();

            function updateCounter(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentVal = Math.floor(target * easeOut);

                el.textContent = `${prefix}${currentVal}${suffix}`;

                if (progress < 1) {
                    requestAnimationFrame(updateCounter);
                } else {
                    el.textContent = `${prefix}${target}${suffix}`;
                }
            }

            requestAnimationFrame(updateCounter);
        });
    }

    // Trigger on scroll into view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCountUp();
            }
        });
    }, { threshold: 0.2 });

    const statsSection = document.querySelector('.hero-metrics-editorial') || document.querySelector('.hero-strip');
    if (statsSection) {
        observer.observe(statsSection);
    }


    // ====================================================
    // 6. Ambient Lighting Hover Effects (3D Tilt Removed)
    // ====================================================
    const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const glow1 = document.querySelector('.ambient-glow-1');
    const glow2 = document.querySelector('.ambient-glow-2');

    if (isFinePointer) {
        window.addEventListener('mousemove', (e) => {
            const moveX = (e.clientX - window.innerWidth / 2) * 0.025;
            const moveY = (e.clientY - window.innerHeight / 2) * 0.025;

            if (glow1) glow1.style.transform = `translate(${moveX}px, ${moveY}px)`;
            if (glow2) glow2.style.transform = `translate(${-moveX}px, ${-moveY}px)`;
        });
    }


    // ====================================================
    // 7. Interactive Project Category Filter Tabs & Dynamic Counts
    // ====================================================
    const filterButtons = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');
    const filterStatusEl = document.getElementById('filterStatus');

    function applyProjectFilter(filterValue, isUserInteraction) {
        let visibleCount = 0;

        filterButtons.forEach(btn => {
            const isActive = btn.getAttribute('data-filter') === filterValue;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        projectCards.forEach(card => {
            const cardCategory = card.getAttribute('data-category') || '';
            const categories = cardCategory.trim().split(/\s+/);
            const matches = filterValue === 'all' || categories.includes(filterValue);

            if (matches) {
                visibleCount++;
                card.style.display = 'flex';
                card.style.animation = 'fadeUp 0.35s var(--apple-ease)';
            } else {
                card.style.display = 'none';
            }
        });

        const projectsGrid = document.querySelector('.projects-editorial-grid');
        if (projectsGrid) {
            projectsGrid.classList.toggle('has-single-card', visibleCount === 1);
        }

        if (filterStatusEl) {
            filterStatusEl.textContent = `Showing ${visibleCount} of ${projectCards.length} projects`;
        }

        if (isUserInteraction) {
            if (filterValue === 'all') {
                if (window.location.hash.startsWith('#filter=')) {
                    history.replaceState(null, '', window.location.pathname + window.location.search);
                }
            } else {
                history.replaceState(null, '', '#filter=' + encodeURIComponent(filterValue));
            }
        }
    }

    // Compute project counts dynamically for each category (Single Source of Truth)
    filterButtons.forEach(btn => {
        const filterValue = btn.getAttribute('data-filter');
        let count = 0;
        projectCards.forEach(card => {
            const categories = (card.getAttribute('data-category') || '').trim().split(/\s+/);
            if (filterValue === 'all' || categories.includes(filterValue)) {
                count++;
            }
        });
        const countSpan = btn.querySelector('.filter-count');
        if (countSpan) {
            countSpan.textContent = count;
        }

        btn.addEventListener('click', () => {
            applyProjectFilter(filterValue, true);
        });
    });

    // Restore filter state from URL hash safely if present
    try {
        if (window.location.hash && window.location.hash.startsWith('#filter=')) {
            const rawHash = window.location.hash.slice(8);
            let decodedFilter = '';
            try {
                decodedFilter = decodeURIComponent(rawHash).trim().toLowerCase();
            } catch (err) {
                decodedFilter = '';
            }
            if (decodedFilter) {
                const validBtn = Array.from(filterButtons).find(btn => {
                    const df = (btn.getAttribute('data-filter') || '').toLowerCase();
                    return df === decodedFilter;
                });
                if (validBtn) {
                    const matchedFilter = validBtn.getAttribute('data-filter');
                    applyProjectFilter(matchedFilter, false);
                } else {
                    applyProjectFilter('all', false);
                }
            }
        }
    } catch (e) {
        console.warn('Failed to parse filter hash:', e);
    }


    // ====================================================
    // 8. Toast Notifications & 1-Click Clipboard
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

    // Dedicated click-to-copy handler (only for elements explicitly specifying data-copy)
    const copyTriggers = document.querySelectorAll('[data-copy]');
    copyTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            const textToCopy = trigger.getAttribute('data-copy');
            if (!textToCopy) return;
            e.preventDefault();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast('Copied email to clipboard! 📋');
                }).catch(() => {
                    showToast('Opening email client...');
                    window.location.href = `mailto:${textToCopy}`;
                });
            } else {
                window.location.href = `mailto:${textToCopy}`;
            }
        });
    });




    // ====================================================
    // 9. Scrollspy Active Section Highlighting (IntersectionObserver)
    // ====================================================
    const sections = document.querySelectorAll('main section[id]');
    const navLinks = document.querySelectorAll('.navlist a');

    if ('IntersectionObserver' in window && sections.length > 0) {
        const visibleSections = new Map();

        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                visibleSections.set(entry.target.id, entry.isIntersecting);
            });

            // Find the highest visible section in DOM order
            let activeId = '';
            for (let i = 0; i < sections.length; i++) {
                const id = sections[i].id;
                if (visibleSections.get(id)) {
                    activeId = id;
                    break;
                }
            }

            if (activeId) {
                navLinks.forEach(link => {
                    const isActive = link.getAttribute('href') === `#${activeId}`;
                    link.classList.toggle('active', isActive);
                    if (isActive) {
                        link.setAttribute('aria-current', 'location');
                    } else {
                        link.removeAttribute('aria-current');
                    }
                });
            }
        }, {
            rootMargin: '-15% 0px -65% 0px',
            threshold: 0
        });

        sections.forEach(section => sectionObserver.observe(section));
    }


    // ====================================================
    // 10. Mobile Menu Floating Dropdown Controller
    // ====================================================
    const navToggleBtn = document.getElementById('navToggle');
    const navlist = document.getElementById('navlist');
    const backdrop = document.getElementById('mobileBackdrop');

    if (navToggleBtn && navlist) {
        function toggleMenu() {
            const isOpen = navlist.classList.toggle('open');
            navToggleBtn.classList.toggle('active', isOpen);
            if (backdrop) backdrop.classList.toggle('show', isOpen);
            navToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (isOpen) {
                document.body.style.overflow = 'hidden';
                const firstLink = navlist.querySelector('a');
                if (firstLink && typeof firstLink.focus === 'function') {
                    firstLink.focus();
                }
            } else {
                document.body.style.overflow = '';
                if (typeof navToggleBtn.focus === 'function') {
                    navToggleBtn.focus();
                }
            }
        }

        function closeMenu(restoreFocus) {
            if (navlist.classList.contains('open')) {
                navlist.classList.remove('open');
                navToggleBtn.classList.remove('active');
                if (backdrop) backdrop.classList.remove('show');
                navToggleBtn.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
                if (restoreFocus && typeof navToggleBtn.focus === 'function') {
                    navToggleBtn.focus();
                }
            }
        }

        navToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
        });

        if (backdrop) {
            backdrop.addEventListener('click', () => closeMenu(true));
        }

        navlist.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                closeMenu(false);
            });
        });

        // Keyboard handler for open menu (Escape closes, Tab trapped within menu)
        document.addEventListener('keydown', (e) => {
            if (!navlist.classList.contains('open')) return;

            if (e.key === 'Escape') {
                closeMenu(true);
                return;
            }

            if (e.key === 'Tab') {
                const focusables = [navToggleBtn].concat(
                    Array.from(navlist.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])'))
                ).filter(el => !el.disabled && el.offsetParent !== null);
                if (focusables.length === 0) return;

                const first = focusables[0];
                const last = focusables[focusables.length - 1];

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
        });

        // Close when resizing back to desktop screen (matches the sidebar
        // breakpoint in portfolio/css/responsive.css: max-width: 1024px)
        window.addEventListener('resize', () => {
            if (!window.matchMedia('(max-width: 1024px)').matches) {
                closeMenu(false);
            }
        });
    }


    // ====================================================
    // 11. Footer Current Year
    // ====================================================
    const yearEl = document.getElementById('year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }


    // ====================================================
    // 12. Dynamic Certificate Lightbox Modal Controller
    // ====================================================
    const certModal = document.getElementById('certModal');
    const certModalImg = document.getElementById('certModalImg');
    const certModalTitle = document.getElementById('certModalTitle');
    const certModalVerify = document.getElementById('certModalVerify');
    const closeCertBtn = document.getElementById('closeCertBtn');
    const closeCertBackdrop = document.getElementById('closeCertBackdrop');

    let certModalCtrl = null;
    if (certModal && window.setupAccessibleModal) {
        certModalCtrl = window.setupAccessibleModal(certModal, null, [closeCertBtn, closeCertBackdrop]);
    }

    function openCertLightbox(imgSrc, title, verifyLink) {
        if (certModal && certModalImg) {
            certModalImg.src = imgSrc;
            certModalImg.alt = 'Full certificate: ' + (title || 'Certificate').replace(/&bull;/g, '•');
            if (certModalTitle) {
                certModalTitle.textContent = (title || 'Certificate Preview').replace(/&bull;/g, '•');
            }
            if (certModalVerify) certModalVerify.href = verifyLink;
            if (certModalCtrl) {
                certModalCtrl.open();
                setTimeout(() => {
                    if (closeCertBtn) closeCertBtn.focus();
                }, 50);
            } else {
                certModal.classList.add('active');
                certModal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
                if (closeCertBtn) closeCertBtn.focus();
            }
        }
    }

    function closeLightbox() {
        if (certModal) {
            if (certModalCtrl) {
                certModalCtrl.close();
            } else {
                certModal.classList.remove('active');
                certModal.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }
        }
    }

    document.querySelectorAll('.cert-card').forEach(card => {
        const imgSrc = card.getAttribute('data-cert-img');
        const title = card.getAttribute('data-cert-title') || 'Certificate Preview';
        const link = card.getAttribute('data-cert-link') || '#';

        card.addEventListener('click', (e) => {
            if (e.target.closest('a') && !e.target.closest('.cert-preview-btn')) return;
            openCertLightbox(imgSrc, title, link);
        });

        const media = card.querySelector('.cert-media');
        const btn = card.querySelector('.cert-preview-btn');

        if (media) {
            media.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCertLightbox(imgSrc, title, link);
                }
            });
        }

        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openCertLightbox(imgSrc, title, link);
            });
        }
    });

    if (closeCertBtn) closeCertBtn.addEventListener('click', closeLightbox);
    if (closeCertBackdrop) closeCertBackdrop.addEventListener('click', closeLightbox);


    // ====================================================
    // 13. Interactive Direct Message Contact Form Controller
    // ====================================================
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        const nameInput = document.getElementById('senderName');
        const emailInput = document.getElementById('senderEmail');
        const phoneInput = document.getElementById('senderPhone');
        const messageInput = document.getElementById('senderMessage');
        const formStatus = document.getElementById('formStatus');

        const nameError = document.getElementById('nameError');
        const emailError = document.getElementById('emailError');
        const phoneError = document.getElementById('phoneError');
        const messageError = document.getElementById('messageError');

        let lastSubmissionTime = 0;
        let lastSubmissionPayload = '';

        function clearErrors() {
            [nameInput, emailInput, phoneInput, messageInput].forEach(input => {
                if (input) {
                    input.classList.remove('is-invalid');
                    input.removeAttribute('aria-invalid');
                }
            });
            if (nameError) nameError.textContent = '';
            if (emailError) emailError.textContent = '';
            if (phoneError) phoneError.textContent = '';
            if (messageError) messageError.textContent = '';
            if (formStatus) {
                formStatus.textContent = '';
                formStatus.className = 'form-status';
            }
        }

        // Live error clearing on input
        [nameInput, emailInput, phoneInput, messageInput].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    input.classList.remove('is-invalid');
                    input.removeAttribute('aria-invalid');
                    const err = document.getElementById(input.id.replace('sender', '').toLowerCase() + 'Error');
                    if (err) err.textContent = '';
                });
            }
        });

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();

            let isValid = true;
            let firstInvalidInput = null;
            const nameVal = nameInput ? nameInput.value.trim() : '';
            const emailVal = emailInput ? emailInput.value.trim() : '';
            const phoneVal = phoneInput ? phoneInput.value.trim() : '';
            const messageVal = messageInput ? messageInput.value.trim() : '';

            // 1. Client-Side Throttle: 30s per session
            const now = Date.now();
            if (lastSubmissionTime && (now - lastSubmissionTime < 30000)) {
                const waitSecs = Math.ceil((30000 - (now - lastSubmissionTime)) / 1000);
                if (formStatus) {
                    formStatus.textContent = `Please wait ${waitSecs}s before sending another message.`;
                    formStatus.className = 'form-status is-error';
                }
                showToast(`Please wait ${waitSecs}s before submitting again.`);
                return;
            }

            // 2. Duplicate Submission Guard
            const currentPayload = `${nameVal.toLowerCase()}|${emailVal.toLowerCase()}|${phoneVal}|${messageVal}`;
            if (lastSubmissionPayload && lastSubmissionPayload === currentPayload) {
                if (formStatus) {
                    formStatus.textContent = 'This message has already been submitted.';
                    formStatus.className = 'form-status is-error';
                }
                showToast('Duplicate message detected.');
                return;
            }

            if (!nameVal || nameVal.length < 2) {
                if (nameInput) {
                    nameInput.classList.add('is-invalid');
                    nameInput.setAttribute('aria-invalid', 'true');
                    if (!firstInvalidInput) firstInvalidInput = nameInput;
                }
                if (nameError) nameError.textContent = 'Please enter your name (at least 2 characters)';
                isValid = false;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailVal || !emailRegex.test(emailVal)) {
                if (emailInput) {
                    emailInput.classList.add('is-invalid');
                    emailInput.setAttribute('aria-invalid', 'true');
                    if (!firstInvalidInput) firstInvalidInput = emailInput;
                }
                if (emailError) emailError.textContent = 'Please enter a valid email address';
                isValid = false;
            }

            if (phoneVal) {
                const digitsOnly = phoneVal.replace(/\D/g, '');
                const isValidCharSet = /^[+]?[\d\s().-]+$/.test(phoneVal);
                if (!isValidCharSet || digitsOnly.length < 7 || digitsOnly.length > 15) {
                    if (phoneInput) {
                        phoneInput.classList.add('is-invalid');
                        phoneInput.setAttribute('aria-invalid', 'true');
                        if (!firstInvalidInput) firstInvalidInput = phoneInput;
                    }
                    if (phoneError) phoneError.textContent = 'Please enter a valid phone number or leave blank';
                    isValid = false;
                }
            }

            if (!messageVal || messageVal.length < 10) {
                if (messageInput) {
                    messageInput.classList.add('is-invalid');
                    messageInput.setAttribute('aria-invalid', 'true');
                    if (!firstInvalidInput) firstInvalidInput = messageInput;
                }
                if (messageError) messageError.textContent = 'Please provide a message (at least 10 characters)';
                isValid = false;
            }

            if (!isValid) {
                if (formStatus) {
                    formStatus.textContent = 'Please correct the errors in the form before submitting.';
                    formStatus.className = 'form-status is-error';
                }
                if (firstInvalidInput && typeof firstInvalidInput.focus === 'function') {
                    firstInvalidInput.focus();
                }
                return;
            }

            // 3. Honeypot Botcheck Guard
            const botcheckField = contactForm.querySelector('input[name="botcheck"]');
            if (botcheckField && (botcheckField.checked || (botcheckField.type !== 'checkbox' && botcheckField.value))) {
                lastSubmissionTime = Date.now();
                lastSubmissionPayload = currentPayload;
                clearErrors();
                contactForm.reset();
                if (formStatus) {
                    formStatus.textContent = '✓ Message delivered directly to Raghavendra!';
                    formStatus.className = 'form-status is-success';
                }
                showToast('✓ Message sent successfully! 🚀');
                return;
            }

            const submitBtn = contactForm.querySelector('button[type="submit"]');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.classList.add('is-loading');
                const btnText = submitBtn.querySelector('.btn-text');
                if (btnText) btnText.textContent = 'Sending...';
            }

            if (formStatus) {
                formStatus.textContent = 'Transmitting message...';
                formStatus.className = 'form-status';
            }

            // Create AbortController with 10-second timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            try {
                const formData = new FormData(contactForm);

                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json'
                    },
                    body: formData,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                const result = await response.json().catch(() => ({}));

                if (response.ok && result.success === true) {
                    lastSubmissionTime = Date.now();
                    lastSubmissionPayload = currentPayload;
                    if (formStatus) {
                        formStatus.textContent = '✓ Message delivered directly to Raghavendra!';
                        formStatus.className = 'form-status is-success';
                    }
                    showToast('✓ Message sent successfully! 🚀');
                    contactForm.reset();
                } else {
                    // Genuine Failure Handling - Do NOT reset form, do NOT force mailto redirect
                    const errorMsg = result.message || 'Submission failed. Please try again.';
                    if (formStatus) {
                        formStatus.textContent = '';
                        formStatus.className = 'form-status is-error';
                        formStatus.appendChild(document.createTextNode(`✕ ${errorMsg} You can also email directly: `));
                        const mailLink = document.createElement('a');
                        mailLink.href = 'mailto:raghavendrayadavgolla@gmail.com';
                        mailLink.style.color = 'var(--teal)';
                        mailLink.style.textDecoration = 'underline';
                        mailLink.textContent = 'raghavendrayadavgolla@gmail.com';
                        formStatus.appendChild(mailLink);
                    }
                    showToast('✕ Unable to send message. Please try again.');
                }
            } catch (err) {
                clearTimeout(timeoutId);
                const isTimeout = err.name === 'AbortError';
                const failureText = isTimeout
                    ? 'Request timed out after 10 seconds.'
                    : 'Network error occurred while sending.';

                if (formStatus) {
                    formStatus.textContent = '';
                    formStatus.className = 'form-status is-error';
                    formStatus.appendChild(document.createTextNode(`✕ ${failureText} You can email directly: `));
                    const mailLink = document.createElement('a');
                    mailLink.href = 'mailto:raghavendrayadavgolla@gmail.com';
                    mailLink.style.color = 'var(--teal)';
                    mailLink.style.textDecoration = 'underline';
                    mailLink.textContent = 'raghavendrayadavgolla@gmail.com';
                    formStatus.appendChild(mailLink);
                }
                showToast(isTimeout ? '✕ Request timed out.' : '✕ Network failure.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('is-loading');
                    const btnText = submitBtn.querySelector('.btn-text');
                    if (btnText) btnText.textContent = 'Send Message';
                }
            }
        });
    }

    // ====================================================
    // 14. Floating Back to Top Button Controller
    // ====================================================
    const backToTopBtn = document.getElementById('backToTopBtn');
    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 400) {
                backToTopBtn.classList.add('show');
            } else {
                backToTopBtn.classList.remove('show');
            }
        }, { passive: true });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // ====================================================
    // 15. Research Paper Abstract & Citation Modal Controller
    // ====================================================
    const citationModal = document.getElementById('citationModal');
    const openCitationBtn = document.getElementById('openCitationBtn');
    const closeCitationBtn = document.getElementById('closeCitationBtn');
    const closeCitationBackdrop = document.getElementById('closeCitationBackdrop');
    const copyBibtexBtn = document.getElementById('copyBibtexBtn');
    const bibtexCode = document.getElementById('bibtexCode');

    let citationModalCtrl = null;
    if (citationModal && window.setupAccessibleModal) {
        citationModalCtrl = window.setupAccessibleModal(citationModal, openCitationBtn, [closeCitationBtn, closeCitationBackdrop]);
    }

    function openCitation() {
        if (citationModal) {
            if (citationModalCtrl) {
                citationModalCtrl.open();
            } else {
                citationModal.classList.add('active');
                citationModal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            }
        }
    }

    function closeCitation() {
        if (citationModal) {
            if (citationModalCtrl) {
                citationModalCtrl.close();
            } else {
                citationModal.classList.remove('active');
                citationModal.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }
        }
    }

    if (openCitationBtn) openCitationBtn.addEventListener('click', openCitation);
    if (closeCitationBtn) closeCitationBtn.addEventListener('click', closeCitation);
    if (closeCitationBackdrop) closeCitationBackdrop.addEventListener('click', closeCitation);

    function fallbackCopy(text) {
        try {
            const tempArea = document.createElement('textarea');
            tempArea.value = text;
            tempArea.style.position = 'fixed';
            tempArea.style.opacity = '0';
            document.body.appendChild(tempArea);
            tempArea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(tempArea);
            if (success) {
                showToast('✓ BibTeX citation copied to clipboard! 📋');
                return;
            }
        } catch (e) { }
        showToast('Could not copy citation.');
    }

    if (copyBibtexBtn && bibtexCode) {
        copyBibtexBtn.addEventListener('click', () => {
            const code = bibtexCode.textContent.trim();
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(code).then(() => {
                    showToast('✓ BibTeX citation copied to clipboard! 📋');
                }).catch(() => {
                    fallbackCopy(code);
                });
            } else {
                fallbackCopy(code);
            }
        });
    }

    // ====================================================
    // 16. PWA Install Prompt (Preserve suppression per owner configuration)
    // ====================================================
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
    });


    // ====================================================
    // IBM Data Analyst Capstone - Tech Adoption Comparator
    // ====================================================
    // Every figure below was recomputed from the capstone's public source data:
    // m1_survey_data.csv (11,552 rows -> 11,398 after removing 154 duplicates;
    // LanguageWorkedWith / LanguageDesireNextYear / DatabaseWorkedWith /
    // DatabaseDesireNextYear) and jobs.json (27,005 postings, word-boundary
    // match on "Key Skills"). Net change = (desired - current) / current.
    (function initCapstoneComparator() {
        const presetBtns = document.querySelectorAll('#capstoneTechPresets .preset-pill');
        const devShareDisplay = document.getElementById('capstoneDevShare');
        const devCountDisplay = document.getElementById('capstoneDevCount');
        const desiredShareDisplay = document.getElementById('capstoneDesiredShare');
        const desiredCountDisplay = document.getElementById('capstoneDesiredCount');
        const momentumValDisplay = document.getElementById('capstoneMomentumVal');
        const jobCountDisplay = document.getElementById('capstoneJobCount');
        const jobShareDisplay = document.getElementById('capstoneJobShare');
        const insightTextDisplay = document.getElementById('capstoneInsightText');

        if (!presetBtns.length || !devShareDisplay) return;

        const techData = {
            python: {
                devShare: '39.8%', devCount: '4,542 respondents',
                desiredShare: '46.0%', desiredCount: '5,239 respondents',
                netChange: '+15.3%',
                jobCount: '1,171', jobShare: '4.3% of 27,005 postings',
                insight: 'Python was used by 39.8% of respondents and wanted by 46.0% for next year — a +15.3% net increase. Among the ten most-used languages, only Python and TypeScript had more developers wanting them than using them.'
            },
            sql: {
                devShare: '62.3%', devCount: '7,106 respondents',
                desiredShare: '44.0%', desiredCount: '5,012 respondents',
                netChange: '−29.5%',
                jobCount: '2,216', jobShare: '8.2% of 27,005 postings',
                insight: 'SQL was used by 62.3% of respondents and appeared in 8.2% of job postings. Fewer respondents listed it as a language they want to use next year (44.0%).'
            },
            javascript: {
                devShare: '76.2%', devCount: '8,687 respondents',
                desiredShare: '58.2%', desiredCount: '6,630 respondents',
                netChange: '−23.7%',
                jobCount: '2,246', jobShare: '8.3% of 27,005 postings',
                insight: 'JavaScript was the most-used language in the survey (76.2%) and appeared in 8.3% of job postings; 58.2% of respondents wanted to use it next year.'
            },
            postgres: {
                devShare: '35.9%', devCount: '4,097 respondents',
                desiredShare: '38.0%', desiredCount: '4,328 respondents',
                netChange: '+5.6%',
                jobCount: '—', jobShare: 'Not analysed for databases',
                insight: 'PostgreSQL was used by 35.9% of respondents and was the most-desired database for next year (38.0%), ahead of MongoDB (32.0%), Redis (29.2%) and MySQL (28.8%).'
            }
        };

        function updateComparator(tech) {
            const data = techData[tech] || techData.python;
            devShareDisplay.textContent = data.devShare;
            if (devCountDisplay) devCountDisplay.textContent = data.devCount;
            if (desiredShareDisplay) desiredShareDisplay.textContent = data.desiredShare;
            if (desiredCountDisplay) desiredCountDisplay.textContent = data.desiredCount;
            if (momentumValDisplay) {
                momentumValDisplay.textContent = data.netChange;
                momentumValDisplay.classList.toggle('is-negative', data.netChange.charAt(0) === '−');
            }
            if (jobCountDisplay) jobCountDisplay.textContent = data.jobCount;
            if (jobShareDisplay) jobShareDisplay.textContent = data.jobShare;
            if (insightTextDisplay) insightTextDisplay.textContent = data.insight;
        }

        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                presetBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                updateComparator(btn.getAttribute('data-tech'));
            });
        });

        updateComparator('python');
    })();

});

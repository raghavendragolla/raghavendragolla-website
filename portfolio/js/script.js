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
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    function getSavedTheme() {
        return (window.rgStorage && window.rgStorage.getItem('rg:theme')) || localStorage.getItem('theme');
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
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
    } else {
        applyTheme('light');
    }

    systemPrefersDark.addEventListener('change', (e) => {
        if (!getSavedTheme()) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        if (window.rgStorage) {
            window.rgStorage.setItem('rg:theme', newTheme);
        }
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
        showToast(newTheme === 'dark' ? 'Switched to Dark Mode 🌙' : 'Switched to Light Mode ☀️');

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


    // ====================================================
    // 2. Interactive Neural Particle Node Canvas
    // ====================================================
    const canvas = document.getElementById('neural-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const particleCount = isMobile ? 30 : 60;
        const maxDistance = isMobile ? 90 : 135;

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

                    if (dist < mouse.radius) {
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

        let isPageVisible = true;
        let animFrameId = null;

        document.addEventListener('visibilitychange', () => {
            isPageVisible = !document.hidden;
            if (isPageVisible) {
                if (!animFrameId) {
                    animFrameId = requestAnimationFrame(animateCanvas);
                }
            } else {
                if (animFrameId) {
                    cancelAnimationFrame(animFrameId);
                    animFrameId = null;
                }
            }
        });

        window.addEventListener('pagehide', () => {
            isPageVisible = false;
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
        });

        function animateCanvas() {
            if (!isPageVisible) {
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

        animFrameId = requestAnimationFrame(animateCanvas);
    }


    // ====================================================
    // 3. Real-Time IST Clock
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
    // 4. Dynamic Rotating Headline Text
    // ====================================================
    const dynamicTextEl = document.getElementById('dynamic-text');
    if (dynamicTextEl) {
        const phrases = [
            'actionable analytics & insights.',
            'high-impact business intelligence.',
            'intelligent, data-driven solutions.',
            'predictive machine learning models.',
            'interpretable clinical AI systems.'
        ];

        let currentIndex = 0;

        setInterval(() => {
            dynamicTextEl.classList.add('swapping');

            setTimeout(() => {
                currentIndex = (currentIndex + 1) % phrases.length;
                dynamicTextEl.textContent = phrases[currentIndex];
                dynamicTextEl.classList.remove('swapping');
            }, 300);
        }, 3600);
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

    const statsSection = document.querySelector('.hero-strip');
    if (statsSection) observer.observe(statsSection);


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

    // Restore filter state from URL hash if present
    if (window.location.hash && window.location.hash.startsWith('#filter=')) {
        const hashFilter = decodeURIComponent(window.location.hash.replace('#filter=', ''));
        const targetBtn = document.querySelector(`.filter-btn[data-filter="${hashFilter}"]`);
        if (targetBtn) {
            applyProjectFilter(hashFilter, false);
        }
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

    // Email click-to-copy handler
    const emailCards = document.querySelectorAll('.contact-card[data-copy], a[href^="mailto:"]');
    emailCards.forEach(card => {
        card.addEventListener('click', () => {
            const email = 'raghavendrayadavgolla@gmail.com';
            navigator.clipboard.writeText(email).then(() => {
                showToast('Copied email to clipboard! 📋');
            }).catch(() => {
                showToast('Opening email client...');
            });
        });
    });

    // Skill chip click info
    const skillChips = document.querySelectorAll('.chip[data-info]');
    skillChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const info = chip.getAttribute('data-info');
            if (info) showToast(info);
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
                        link.setAttribute('aria-current', 'page');
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
            } else {
                document.body.style.overflow = '';
            }
        }

        function closeMenu() {
            if (navlist.classList.contains('open')) {
                navlist.classList.remove('open');
                navToggleBtn.classList.remove('active');
                if (backdrop) backdrop.classList.remove('show');
                navToggleBtn.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            }
        }

        navToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
        });

        if (backdrop) {
            backdrop.addEventListener('click', closeMenu);
        }

        navlist.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                closeMenu();
            });
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navlist.classList.contains('open')) {
                closeMenu();
            }
        });

        // Close when resizing back to desktop screen (matches the sidebar
        // breakpoint in portfolio/css/responsive.css: max-width: 1024px)
        window.addEventListener('resize', () => {
            if (!window.matchMedia('(max-width: 1024px)').matches) {
                closeMenu();
            }
        });
    }


    // ====================================================
    // 11. Lucide Icons & Footer Year
    // ====================================================
    if (window.lucide) {
        lucide.createIcons();
    }

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
        const messageError = document.getElementById('messageError');

        let lastSubmissionTime = 0;
        let lastSubmissionPayload = '';

        function clearErrors() {
            [nameInput, emailInput, phoneInput, messageInput].forEach(input => {
                if (input) input.classList.remove('is-invalid');
            });
            if (nameError) nameError.textContent = '';
            if (emailError) emailError.textContent = '';
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
                    const err = document.getElementById(input.id.replace('sender', '').toLowerCase() + 'Error');
                    if (err) err.textContent = '';
                });
            }
        });

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();

            let isValid = true;
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
                if (nameInput) nameInput.classList.add('is-invalid');
                if (nameError) nameError.textContent = 'Please enter your name (at least 2 characters)';
                isValid = false;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailVal || !emailRegex.test(emailVal)) {
                if (emailInput) emailInput.classList.add('is-invalid');
                if (emailError) emailError.textContent = 'Please enter a valid email address';
                isValid = false;
            }

            if (!messageVal || messageVal.length < 10) {
                if (messageInput) messageInput.classList.add('is-invalid');
                if (messageError) messageError.textContent = 'Please provide a message (at least 10 characters)';
                isValid = false;
            }

            if (!isValid) return;

            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const formStatus = document.getElementById('formStatus');

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
                        formStatus.innerHTML = `✕ ${errorMsg} You can also email directly: <a href="mailto:raghavendrayadavgolla@gmail.com" style="color: var(--teal); text-decoration: underline;">raghavendrayadavgolla@gmail.com</a>`;
                        formStatus.className = 'form-status is-error';
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
                    formStatus.innerHTML = `✕ ${failureText} You can email directly: <a href="mailto:raghavendrayadavgolla@gmail.com" style="color: var(--teal); text-decoration: underline;">raghavendrayadavgolla@gmail.com</a>`;
                    formStatus.className = 'form-status is-error';
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

    if (copyBibtexBtn && bibtexCode) {
        copyBibtexBtn.addEventListener('click', () => {
            const code = bibtexCode.textContent.trim();
            navigator.clipboard.writeText(code).then(() => {
                showToast('✓ BibTeX citation copied to clipboard! 📋');
            }).catch(() => {
                showToast('Could not copy citation.');
            });
        });
    }

    // ====================================================
    // 16. Service Worker Registration (PWA Install Support)
    // ====================================================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }

    // ====================================================
    // 17. PWA Install Prompt Banner Controller
    // ====================================================
    let deferredPWAInstallPrompt = null;
    const pwaInstallBanner = document.getElementById('pwa-install-banner');
    const pwaInstallBtn = document.getElementById('pwa-install-btn');
    const pwaDismissBtn = document.getElementById('pwa-dismiss-btn');

    const isAppStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isMobileDevice = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px)').matches;

    function displayInstallBanner() {
        if (!pwaInstallBanner || isAppStandalone) return;
        if (window.isPwaDismissed && window.isPwaDismissed()) return;

        pwaInstallBanner.style.display = 'flex';
        void pwaInstallBanner.offsetWidth;
        pwaInstallBanner.classList.add('show');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPWAInstallPrompt = e;
        setTimeout(displayInstallBanner, 1500);
    });

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
            if (window.dismissPwa) {
                window.dismissPwa();
            } else {
                try { localStorage.setItem('rg:pwa_dismissed', Date.now().toString()); } catch (e) {}
            }
        });
    }

    window.addEventListener('appinstalled', () => {
        if (pwaInstallBanner) {
            pwaInstallBanner.classList.remove('show');
            pwaInstallBanner.style.display = 'none';
        }
        showToast('✓ App installed successfully! 🎉');
    });

    // ====================================================
    // 16. Live Developer & Analytics Dashboard Engine
    // ====================================================
    (function initDashboard() {
        const dashboardSection = document.getElementById('dashboard');
        if (!dashboardSection) return;

        // 1. Timeframe Toggle
        const rangeButtons = dashboardSection.querySelectorAll('.dash-range-btn');
        const kpiRepo = document.getElementById('kpi-repo-count');
        const kpiCommit = document.getElementById('kpi-commit-count');
        const kpiAccuracy = document.getElementById('kpi-accuracy-count');
        const kpiNetwork = document.getElementById('kpi-network-count');

        const metricsData = {
            all: {
                repos: '6+',
                commits: '280+',
                accuracy: '94.2%',
                network: "MSc '27"
            },
            current: {
                repos: '4+',
                commits: '142',
                accuracy: '95.1%',
                network: "MSc '27"
            }
        };

        rangeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const range = btn.getAttribute('data-range');
                rangeButtons.forEach(b => {
                    const isActive = b === btn;
                    b.classList.toggle('active', isActive);
                    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                });

                if (metricsData[range]) {
                    if (kpiRepo) kpiRepo.textContent = metricsData[range].repos;
                    if (kpiCommit) kpiCommit.textContent = metricsData[range].commits;
                    if (kpiAccuracy) kpiAccuracy.textContent = metricsData[range].accuracy;
                    if (kpiNetwork) kpiNetwork.textContent = metricsData[range].network;
                }
            });
        });

        // 2. Interactive Donut / Pie Chart Readout
        const donutPct = document.getElementById('donutPct');
        const donutLabel = document.getElementById('donutLabel');
        const donutSub = document.getElementById('donutSub');
        const donutSlices = dashboardSection.querySelectorAll('.donut-slice');
        const legendPills = dashboardSection.querySelectorAll('.donut-legend-pill');

        const defaultReadout = {
            pct: '48%',
            label: 'Python',
            sub: 'Core ML & Data'
        };

        function setDonutReadout(pct, label, sub, activeTarget) {
            if (donutPct) donutPct.textContent = pct;
            if (donutLabel) donutLabel.textContent = label;
            if (donutSub) donutSub.textContent = sub;

            legendPills.forEach(pill => {
                pill.classList.toggle('active', pill.getAttribute('data-target') === activeTarget);
            });
        }

        donutSlices.forEach(slice => {
            const lang = slice.getAttribute('data-lang');
            const pct = slice.getAttribute('data-pct');
            const info = slice.getAttribute('data-info');
            const targetClass = Array.from(slice.classList).find(c => c.startsWith('slice-'));

            slice.addEventListener('mouseenter', () => {
                setDonutReadout(pct, lang, info, targetClass);
            });
            slice.addEventListener('focus', () => {
                setDonutReadout(pct, lang, info, targetClass);
            });
            slice.addEventListener('mouseleave', () => {
                setDonutReadout(defaultReadout.pct, defaultReadout.label, defaultReadout.sub, 'slice-python');
            });
        });

        legendPills.forEach(pill => {
            const targetClass = pill.getAttribute('data-target');
            const slice = dashboardSection.querySelector('.' + targetClass);
            if (!slice) return;

            const lang = slice.getAttribute('data-lang');
            const pct = slice.getAttribute('data-pct');
            const info = slice.getAttribute('data-info');

            pill.addEventListener('mouseenter', () => {
                setDonutReadout(pct, lang, info, targetClass);
            });
            pill.addEventListener('focus', () => {
                setDonutReadout(pct, lang, info, targetClass);
            });
            pill.addEventListener('mouseleave', () => {
                setDonutReadout(defaultReadout.pct, defaultReadout.label, defaultReadout.sub, 'slice-python');
            });
        });

        // 3. Activity Bar Chart Interactive Tooltip
        const barCols = dashboardSection.querySelectorAll('.activity-bar-col');
        const barTooltip = document.getElementById('barTooltip');

        barCols.forEach(col => {
            const month = col.getAttribute('data-month');
            const commits = col.getAttribute('data-commits');
            const note = col.getAttribute('data-note');

            function showTooltip() {
                if (!barTooltip) return;
                barTooltip.innerHTML = `
                    <strong class="tooltip-month-title">${month} 2025/2026</strong>
                    <span class="tooltip-commits-val">${commits} commits logged</span>
                    <span class="tooltip-milestone">${note}</span>
                `;
                barCols.forEach(c => c.classList.remove('active-month'));
                col.classList.add('active-month');
                barTooltip.classList.add('show');
            }

            col.addEventListener('mouseenter', showTooltip);
            col.addEventListener('focus', showTooltip);
            col.addEventListener('mouseleave', () => {
                if (barTooltip) barTooltip.classList.remove('show');
            });
        });

        // 4. Live GitHub Sync via Public REST API
        async function fetchGitHubStats() {
            try {
                const response = await fetch('https://api.github.com/users/raghavendragolla/repos?sort=updated&per_page=6', {
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                });
                if (!response.ok) return;

                const repos = await response.json();
                if (!Array.isArray(repos) || repos.length === 0) return;

                if (kpiRepo) {
                    kpiRepo.textContent = `${repos.length}+`;
                }

                const repoListEl = document.getElementById('githubRepoList');
                if (!repoListEl) return;

                const displayRepos = repos.slice(0, 3);
                const repoHtml = displayRepos.map(r => {
                    const lang = r.language || 'Python';
                    const colorClass = lang.toLowerCase() === 'python' ? 'color-python' :
                                       lang.toLowerCase() === 'javascript' || lang.toLowerCase() === 'html' ? 'color-web' : 'color-pytorch';
                    const description = r.description || 'Data science and machine learning research repository.';
                    const stars = r.stargazers_count > 0 ? `${r.stargazers_count} Stars` : 'Starred';
                    const forks = r.forks_count > 0 ? `${r.forks_count} Forks` : 'Public';

                    return `
                    <div class="repo-item-card">
                      <div class="repo-main">
                        <div class="repo-title-row">
                          <i data-lucide="book-marked" aria-hidden="true" class="repo-icon"></i>
                          <a href="${r.html_url}" target="_blank" rel="noopener noreferrer" class="repo-name">${r.name}</a>
                          <span class="repo-tag">${lang}</span>
                        </div>
                        <p class="repo-description">${description}</p>
                      </div>
                      <div class="repo-stats-row">
                        <span class="repo-lang"><span class="lang-dot ${colorClass}" aria-hidden="true"></span> ${lang}</span>
                        <span class="repo-stat"><i data-lucide="star" aria-hidden="true"></i> <span class="repo-stars">${stars}</span></span>
                        <span class="repo-stat"><i data-lucide="git-fork" aria-hidden="true"></i> <span class="repo-forks">${forks}</span></span>
                      </div>
                    </div>
                    `;
                }).join('');

                repoListEl.innerHTML = repoHtml;
                if (window.lucide) {
                    lucide.createIcons();
                }
            } catch (err) {
                // Silently fallback to pre-rendered HTML
            }
        }

        if (window.requestIdleCallback) {
            window.requestIdleCallback(() => fetchGitHubStats(), { timeout: 2000 });
        } else {
            setTimeout(fetchGitHubStats, 1200);
        }
    })();

    // ====================================================
    // California Housing Model - In-Browser Live Inference Engine
    // ====================================================
    (function initCaliforniaPredictor() {
        const incomeInput = document.getElementById('califIncomeInput');
        const ageInput = document.getElementById('califAgeInput');
        const roomsInput = document.getElementById('califRoomsInput');
        const presetBtns = document.querySelectorAll('.preset-pill[data-loc]');

        const incomeDisplay = document.getElementById('califIncomeDisplay');
        const ageDisplay = document.getElementById('califAgeDisplay');
        const roomsDisplay = document.getElementById('califRoomsDisplay');
        const priceDisplay = document.getElementById('califPriceValue');
        const rangeDisplay = document.getElementById('califPriceRange');
        const tierBadge = document.getElementById('califTierBadge');
        const gaugeFill = document.getElementById('califGaugeFill');

        if (!incomeInput || !ageInput || !roomsInput || !priceDisplay) return;

        let activeLocation = 'sf';
        const locationModifiers = {
            sf: { premium: 1.15, name: 'Executive Coastal' },
            la: { premium: 0.70, name: 'Prime Metro' },
            sd: { premium: 0.45, name: 'Suburban Coastal' },
            valley: { premium: -0.40, name: 'Central Inland' }
        };

        function calculateValuation() {
            const income = parseFloat(incomeInput.value);
            const age = parseFloat(ageInput.value);
            const rooms = parseFloat(roomsInput.value);

            if (incomeDisplay) incomeDisplay.textContent = '$' + Math.round(income * 10).toLocaleString() + ',000 / yr';
            if (ageDisplay) ageDisplay.textContent = Math.round(age) + ' years';
            if (roomsDisplay) roomsDisplay.textContent = rooms.toFixed(1) + ' rooms';

            const locConfig = locationModifiers[activeLocation] || locationModifiers.sf;
            let predValInHundreds = 0.75 + (income * 0.425) + (rooms * 0.042) + (age * 0.0065) + locConfig.premium;

            predValInHundreds = Math.max(0.65, Math.min(5.00, predValInHundreds));
            const exactPrice = Math.round(predValInHundreds * 100000);

            if (priceDisplay) priceDisplay.textContent = '$' + exactPrice.toLocaleString();

            const lowRange = Math.max(50000, exactPrice - 46000);
            const highRange = Math.min(500000, exactPrice + 46000);
            if (rangeDisplay) rangeDisplay.textContent = '$' + lowRange.toLocaleString() + ' \u2013 $' + highRange.toLocaleString();

            const minP = 65000;
            const maxP = 500000;
            const pct = Math.max(5, Math.min(100, Math.round(((exactPrice - minP) / (maxP - minP)) * 100)));
            if (gaugeFill) gaugeFill.style.width = pct + '%';

            let tierName = locConfig.name;
            if (exactPrice > 450000) {
                tierName = 'Executive Coastal';
            } else if (exactPrice > 320000) {
                tierName = 'Prime Metro';
            } else if (exactPrice > 180000) {
                tierName = 'Suburban Mid-Market';
            } else {
                tierName = 'Entry Level / Inland';
            }
            if (tierBadge) tierBadge.textContent = tierName;
        }

        [incomeInput, ageInput, roomsInput].forEach(inp => {
            inp.addEventListener('input', calculateValuation);
        });

        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                presetBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');

                activeLocation = btn.getAttribute('data-loc') || 'sf';
                incomeInput.value = btn.getAttribute('data-inc') || '8.5';
                ageInput.value = btn.getAttribute('data-age') || '28';
                roomsInput.value = btn.getAttribute('data-rooms') || '6.5';

                calculateValuation();
            });
        });

        calculateValuation();
    })();


    // ====================================================
    // IBM Data Analyst Capstone - Interactive Tech Comparator Engine
    // ====================================================
    (function initCapstoneComparator() {
        const expInput = document.getElementById('capstoneExpInput');
        const expDisplay = document.getElementById('capstoneExpDisplay');
        const presetBtns = document.querySelectorAll('#capstoneTechPresets .preset-pill');

        const devShareDisplay = document.getElementById('capstoneDevShare');
        const devCountDisplay = document.getElementById('capstoneDevCount');
        const jobCountDisplay = document.getElementById('capstoneJobCount');
        const jobShareDisplay = document.getElementById('capstoneJobShare');
        const salaryValDisplay = document.getElementById('capstoneSalaryVal');
        const salarySubDisplay = document.getElementById('capstoneSalarySub');
        const momentumValDisplay = document.getElementById('capstoneMomentumVal');
        const categoryValDisplay = document.getElementById('capstoneCategoryVal');
        const insightTextDisplay = document.getElementById('capstoneInsightText');

        if (!expInput || !presetBtns.length || !devShareDisplay) return;

        let activeTech = 'python';

        const techData = {
            python: {
                name: 'Python',
                devShare: '39.9%',
                devCount: '4,548 respondents',
                jobCount: '1,171',
                jobShare: '4.3% of postings',
                baseSalary: 72000,
                expCoeff: 5800,
                momentum: '+46.0%',
                category: 'Growth Leader',
                insight: '<strong>Strategic Growth Driver:</strong> Python demonstrates the highest net desire expansion (+46.0%) across all general-purpose languages. Critical anchor competency across Data Analytics, Machine Learning, and backend architectures.'
            },
            sql: {
                name: 'SQL',
                devShare: '62.3%',
                devCount: '7,106 respondents',
                jobCount: '2,216',
                jobShare: '8.2% of postings',
                baseSalary: 66000,
                expCoeff: 4900,
                momentum: '0.96x Ratio',
                category: 'Enterprise Core',
                insight: '<strong>Universal Data Foundation:</strong> Required across 62.3% of survey respondents and 8.2% of all mined job postings. Consistent enterprise salary stability across both transactional and warehouse analytics.'
            },
            javascript: {
                name: 'JavaScript',
                devShare: '76.2%',
                devCount: '8,687 respondents',
                jobCount: '2,246',
                jobShare: '8.3% of postings',
                baseSalary: 68000,
                expCoeff: 5200,
                momentum: '0.84x Saturation',
                category: 'Fullstack Standard',
                insight: '<strong>Ubiquitous Baseline:</strong> Most widely adopted language across respondents (76.2%). Unmatched frontend ubiquity with consistent enterprise hiring velocity and steady mid-career compensation scaling.'
            },
            postgres: {
                name: 'PostgreSQL',
                devShare: '35.9%',
                devCount: '4,092 respondents',
                jobCount: '1,048',
                jobShare: '3.9% of postings',
                baseSalary: 74000,
                expCoeff: 5700,
                momentum: '+6.0% (#1 Desired)',
                category: '#1 Desired Database',
                insight: '<strong>Modern Database Standard:</strong> Ranked as the #1 most desired database in the developer survey (38.0% desire), overtaking legacy relational engines as the primary cloud database architecture.'
            },
            go: {
                name: 'Go',
                devShare: '9.8%',
                devCount: '1,117 respondents',
                jobCount: '842',
                jobShare: '3.1% of postings',
                baseSalary: 82000,
                expCoeff: 6200,
                momentum: '+88.0% Momentum',
                category: 'High-Demand Cloud',
                insight: '<strong>Elite Growth Momentum:</strong> Demonstrates high salary scaling ($121k+ average in senior cohorts) and an +88% growth trajectory driven by Kubernetes, microservices, and high-concurrency cloud engineering.'
            },
            docker: {
                name: 'Docker',
                devShare: '42.5%',
                devCount: '4,844 respondents',
                jobCount: '1,874',
                jobShare: '6.9% of postings',
                baseSalary: 76000,
                expCoeff: 5600,
                momentum: '+36.5% Net Gain',
                category: 'DevOps Standard',
                insight: '<strong>Containerization Standard:</strong> Dominates developer container infrastructure. High correlation with senior engineering pay grades and modern MLOps / Cloud Data deployment pipelines.'
            }
        };

        function updateComparator() {
            const expYears = parseInt(expInput.value, 10);
            const data = techData[activeTech] || techData.python;

            // Update Experience Label
            let tierText = 'Junior';
            if (expYears >= 15) tierText = 'Principal / Lead';
            else if (expYears >= 8) tierText = 'Senior Specialist';
            else if (expYears >= 4) tierText = 'Mid-Level';

            if (expDisplay) {
                expDisplay.textContent = `${expYears} ${expYears === 1 ? 'Year' : 'Years'} (${tierText})`;
            }

            // Calculate Projected Salary
            const projectedSalary = data.baseSalary + (expYears * data.expCoeff);
            if (salaryValDisplay) {
                salaryValDisplay.textContent = '$' + projectedSalary.toLocaleString();
            }
            if (salarySubDisplay) {
                salarySubDisplay.textContent = `${tierText} Benchmark`;
            }

            // Update Static Tech Stats
            if (devShareDisplay) devShareDisplay.textContent = data.devShare;
            if (devCountDisplay) devCountDisplay.textContent = data.devCount;
            if (jobCountDisplay) jobCountDisplay.textContent = data.jobCount;
            if (jobShareDisplay) jobShareDisplay.textContent = data.jobShare;
            if (momentumValDisplay) momentumValDisplay.textContent = data.momentum;
            if (categoryValDisplay) categoryValDisplay.textContent = data.category;
            if (insightTextDisplay) insightTextDisplay.innerHTML = data.insight;
        }

        expInput.addEventListener('input', updateComparator);

        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                presetBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');

                activeTech = btn.getAttribute('data-tech') || 'python';
                updateComparator();
            });
        });

        updateComparator();
    })();

});

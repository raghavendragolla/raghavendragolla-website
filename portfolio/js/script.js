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
        return localStorage.getItem('theme');
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

    // Initialize Theme (Default to Dark Mode just like the main website)
    const savedTheme = getSavedTheme();
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme('dark');
    }

    systemPrefersDark.addEventListener('change', (e) => {
        if (!getSavedTheme()) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
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
        const isMobile = window.innerWidth <= 768;
        const particleCount = isMobile ? 30 : 60;
        const maxDistance = isMobile ? 90 : 135;

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
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            tealRgb = isDark ? '66, 179, 171' : '47, 125, 120';
            goldRgb = isDark ? '226, 179, 74' : '184, 144, 47';
        };

        window.updateCanvasTheme();

        function animateCanvas() {
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

            requestAnimationFrame(animateCanvas);
        }

        animateCanvas();
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
            'intelligent, data-driven solutions.',
            'predictive machine learning models.',
            'interpretable healthcare AI.',
            'actionable analytics & insights.',
            'full-stack intelligent systems.'
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
    // 6. 3D Magnetic Tilt & Specular Highlights
    // ====================================================
    const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const tiltCards = document.querySelectorAll('.project-card, .skill-group, .profile-summary');
    const glow1 = document.querySelector('.ambient-glow-1');
    const glow2 = document.querySelector('.ambient-glow-2');

    if (isFinePointer) {
        window.addEventListener('mousemove', (e) => {
            const moveX = (e.clientX - window.innerWidth / 2) * 0.025;
            const moveY = (e.clientY - window.innerHeight / 2) * 0.025;

            if (glow1) glow1.style.transform = `translate(${moveX}px, ${moveY}px)`;
            if (glow2) glow2.style.transform = `translate(${-moveX}px, ${-moveY}px)`;
        });

        tiltCards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -5;
                const rotateY = ((x - centerX) / centerX) * 5;

                card.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)';
            });
        });
    }


    // ====================================================
    // 7. Interactive Project Category Filter Tabs
    // ====================================================
    const filterButtons = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filterValue = btn.getAttribute('data-filter');

            projectCards.forEach(card => {
                const cardCategory = card.getAttribute('data-category');
                if (filterValue === 'all' || cardCategory.includes(filterValue)) {
                    card.style.display = 'flex';
                    card.style.animation = 'fadeUp 0.35s var(--apple-ease)';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });


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
        card.addEventListener('click', (e) => {
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
    // 9. Scrollspy Active Section Highlighting
    // ====================================================
    const sections = document.querySelectorAll('main section[id]');
    const navLinks = document.querySelectorAll('.navlist a');

    function setActiveLink() {
        let currentSectionId = '';
        const scrollPosition = window.scrollY + 160;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                currentSectionId = section.getAttribute('id');
            }
        });

        if (currentSectionId) {
            navLinks.forEach(link => {
                link.classList.toggle('active', link.getAttribute('href') === `#${currentSectionId}`);
            });
        }
    }

    window.addEventListener('scroll', setActiveLink, { passive: true });
    setActiveLink();


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

        // Close when resizing back to desktop screen
        window.addEventListener('resize', () => {
            if (window.innerWidth > 992) {
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

    function openCertLightbox(imgSrc, title, verifyLink) {
        if (certModal && certModalImg) {
            certModalImg.src = imgSrc;
            if (certModalTitle) certModalTitle.innerHTML = title;
            if (certModalVerify) certModalVerify.href = verifyLink;
            certModal.classList.add('active');
            certModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeLightbox() {
        if (certModal) {
            certModal.classList.remove('active');
            certModal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
    }

    document.querySelectorAll('.cert-card').forEach(card => {
        const imgSrc = card.getAttribute('data-cert-img');
        const title = card.getAttribute('data-cert-title') || 'Certificate Preview';
        const link = card.getAttribute('data-cert-link') || '#';

        const media = card.querySelector('.cert-media');
        const btn = card.querySelector('.cert-preview-btn');

        if (media) {
            media.addEventListener('click', () => openCertLightbox(imgSrc, title, link));
            media.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCertLightbox(imgSrc, title, link);
                }
            });
        }

        if (btn) {
            btn.addEventListener('click', () => openCertLightbox(imgSrc, title, link));
        }
    });

    if (closeCertBtn) closeCertBtn.addEventListener('click', closeLightbox);
    if (closeCertBackdrop) closeCertBackdrop.addEventListener('click', closeLightbox);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && certModal && certModal.classList.contains('active')) {
            closeLightbox();
        }
    });


    // ====================================================
    // 13. Interactive Direct Message Contact Form Controller
    // ====================================================
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        const nameInput = document.getElementById('senderName');
        const emailInput = document.getElementById('senderEmail');
        const phoneInput = document.getElementById('senderPhone');
        const topicSelect = document.getElementById('senderTopic');
        const messageInput = document.getElementById('senderMessage');
        const submitBtn = document.getElementById('submitBtn');
        const formStatus = document.getElementById('formStatus');

        const nameError = document.getElementById('nameError');
        const emailError = document.getElementById('emailError');
        const messageError = document.getElementById('messageError');

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
            const topicVal = topicSelect ? topicSelect.value : 'General Inquiry';

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

            // Loading state
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

            try {
                // Submit to Web3Forms API endpoint
                const formData = new FormData(contactForm);

                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json'
                    },
                    body: formData
                });

                const result = await response.json().catch(() => ({}));

                if (response.ok && result.success !== false) {
                    if (formStatus) {
                        formStatus.textContent = '✓ Message delivered directly to Raghavendra!';
                        formStatus.className = 'form-status is-success';
                    }
                    showToast('✓ Message sent successfully! 🚀');
                    contactForm.reset();
                } else {
                    // Graceful fallback to mail client with prefilled values
                    if (formStatus) {
                        formStatus.textContent = '✓ Note saved! Opening your mail client as backup...';
                        formStatus.className = 'form-status is-success';
                    }
                    showToast('Opening email backup...');
                    const phoneText = phoneVal ? `\nPhone: ${phoneVal}` : '';
                    const subject = encodeURIComponent(`[Portfolio Contact] ${topicVal} - from ${nameVal}`);
                    const body = encodeURIComponent(`Name: ${nameVal}\nEmail: ${emailVal}${phoneText}\nTopic: ${topicVal}\n\nMessage:\n${messageVal}`);
                    window.location.href = `mailto:raghavendrayadavgolla@gmail.com?subject=${subject}&body=${body}`;
                    contactForm.reset();
                }
            } catch (err) {
                console.warn('Network submit fallback:', err);
                if (formStatus) {
                    formStatus.textContent = 'Opening your mail client...';
                    formStatus.className = 'form-status is-success';
                }
                const phoneText = phoneVal ? `\nPhone: ${phoneVal}` : '';
                const subject = encodeURIComponent(`[Portfolio Contact] ${topicVal} - from ${nameVal}`);
                const body = encodeURIComponent(`Name: ${nameVal}\nEmail: ${emailVal}${phoneText}\nTopic: ${topicVal}\n\nMessage:\n${messageVal}`);
                window.location.href = `mailto:raghavendrayadavgolla@gmail.com?subject=${subject}&body=${body}`;
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
});
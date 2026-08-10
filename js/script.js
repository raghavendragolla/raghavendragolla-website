/**
 * Raghavendra Golla - Personal Website Script
 * Theme Toggle, Copy Email Toast, CTA interaction
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. Theme Management (Light / Dark Mode)
    // ----------------------------------------------------
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
    }

    // Initialize Theme
    const savedTheme = getSavedTheme();
    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (systemPrefersDark.matches) {
        applyTheme('dark');
    }

    // System Preference Change Listener
    systemPrefersDark.addEventListener('change', (e) => {
        if (!getSavedTheme()) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });

    // Toggle Button Click Handler
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }

    // ----------------------------------------------------
    // 2. Toast Notification System
    // ----------------------------------------------------
    let toastTimeout;

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
            document.body.appendChild(toast);
        }

        const messageEl = toast.querySelector('.toast-message');
        if (messageEl) messageEl.textContent = message;

        clearTimeout(toastTimeout);
        toast.classList.remove('hide');
        toast.classList.add('show');

        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
        }, 3200);
    }

    // ----------------------------------------------------
    // 3. Email Link Action
    // ----------------------------------------------------
    const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
    emailLinks.forEach(emailLink => {
        emailLink.addEventListener('click', () => {
            showToast('Opening email application...');
        });
    });

    // ----------------------------------------------------
    // 4. CTA Button Click Handler
    // ----------------------------------------------------
    const enterBtn = document.querySelector('.enter');
    if (enterBtn) {
        enterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Portfolio is coming soon! Stay tuned.');
        });
    }

    // ----------------------------------------------------
    // 5. Dynamic Footer Year
    // ----------------------------------------------------
    const footerText = document.querySelector('footer div');
    if (footerText) {
        const currentYear = new Date().getFullYear();
        footerText.innerHTML = `&copy; ${currentYear} www.raghavendragolla.com`;
    }

    // ----------------------------------------------------
    // 6. 3D Card Spotlight & Mouse Movement Parallax
    // ----------------------------------------------------
    const glow1 = document.querySelector('.ambient-glow-1');
    const glow2 = document.querySelector('.ambient-glow-2');
    const highlightCards = document.querySelectorAll('.highlight-card');

    if (window.innerWidth > 768) {
        window.addEventListener('mousemove', (e) => {
            const moveX = (e.clientX - window.innerWidth / 2) * 0.035;
            const moveY = (e.clientY - window.innerHeight / 2) * 0.035;

            if (glow1) glow1.style.transform = `translate(${moveX}px, ${moveY}px)`;
            if (glow2) glow2.style.transform = `translate(${-moveX}px, ${-moveY}px)`;
        });

        highlightCards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
            });
        });
    }

    // ----------------------------------------------------
    // 7. Tech Stack Skill Chips Interaction
    // ----------------------------------------------------
    const skillChips = document.querySelectorAll('.skill-chip');
    skillChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const skillName = chip.textContent.trim();
            showToast('Expertise area: ' + skillName);
        });
    });

    // ----------------------------------------------------
    // 8. Live Vitals Heartbeat Counter
    // ----------------------------------------------------
    const vitalsText = document.getElementById('vitals-bpm');
    if (vitalsText) {
        setInterval(() => {
            const randomBpm = 70 + Math.floor(Math.random() * 6);
            vitalsText.textContent = randomBpm + ' BPM';
        }, 4000);
    }
});

/**
 * Ask GORA - AI Portfolio Assistant Frontend Module
 * Pure Vanilla JavaScript • Zero External Dependencies • Accessible & Responsive
 */

(function () {
    'use strict';

    // 1. Configurable Backend Settings
    var CONFIG = {
        apiBase: (typeof window !== 'undefined' && window.GORA_API_BASE) || 'https://ai.raghavendragolla.com',
        chatEndpoint: '/chat',
        maxChars: 400,
        timeoutMs: 15000
    };

    // 2. Chat State
    var state = {
        isOpen: false,
        isMinimized: false,
        isLoading: false,
        lastFailedMessage: null,
        history: []
    };

    var savedScrollY = 0;
    var resizeRaf = null;
    var activeController = null;
    var currentSessionId = 0;
    var initialMessagesHTML = '';

    // DOM references
    var launcher = null;
    var panel = null;
    var minimizeBtn = null;
    var closeBtn = null;
    var messagesContainer = null;
    var chatForm = null;
    var chatInput = null;
    var sendBtn = null;

    /**
     * Scroll messages container to the latest message
     */
    function scrollToBottom(instant) {
        if (!messagesContainer) return;
        if (instant) {
            messagesContainer.style.scrollBehavior = 'auto';
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            messagesContainer.style.scrollBehavior = '';
        } else {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    /**
     * Parse assistant text for safe inline bold and markdown links
     */
    function renderFormattedContent(container, text) {
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.trim().length === 0) continue;

            var p = document.createElement('p');

            // Regex matches [label](url) or **bold**
            var tokenRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;
            var lastIndex = 0;
            var match;

            while ((match = tokenRegex.exec(line)) !== null) {
                if (match.index > lastIndex) {
                    p.appendChild(document.createTextNode(line.substring(lastIndex, match.index)));
                }

                if (match[1] && match[2]) {
                    // Link
                    var link = document.createElement('a');
                    link.href = match[2];
                    link.textContent = match[1];
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    p.appendChild(link);
                } else if (match[3]) {
                    // Bold
                    var strong = document.createElement('strong');
                    strong.textContent = match[3];
                    p.appendChild(strong);
                }

                lastIndex = match.index + match[0].length;
            }

            if (lastIndex < line.length) {
                p.appendChild(document.createTextNode(line.substring(lastIndex)));
            }

            container.appendChild(p);
        }
    }

    /**
     * Append a message bubble to the chat log
     */
    function appendMessage(role, content) {
        if (!messagesContainer) return;

        var msgEl = document.createElement('div');
        msgEl.className = 'ask-gora-msg ' + (role === 'user' ? 'ask-gora-msg-user' : 'ask-gora-msg-assistant');

        var bubbleEl = document.createElement('div');
        bubbleEl.className = 'ask-gora-msg-bubble';

        if (role === 'assistant') {
            renderFormattedContent(bubbleEl, content);
        } else {
            var p = document.createElement('p');
            p.textContent = content;
            bubbleEl.appendChild(p);
        }

        msgEl.appendChild(bubbleEl);

        var meta = document.createElement('span');
        meta.className = 'ask-gora-msg-meta';
        meta.textContent = role === 'user' ? 'You' : 'GORA';
        msgEl.appendChild(meta);

        messagesContainer.appendChild(msgEl);
        scrollToBottom();
    }

    /**
     * Append a friendly error card with "Try again" action
     */
    function appendErrorCard(title, description, rawQuery) {
        if (!messagesContainer) return;

        var msgEl = document.createElement('div');
        msgEl.className = 'ask-gora-msg ask-gora-msg-assistant ask-gora-msg-error';

        var bubbleEl = document.createElement('div');
        bubbleEl.className = 'ask-gora-msg-bubble ask-gora-error-bubble';

        // Error header with subtle warning icon
        var headerEl = document.createElement('div');
        headerEl.className = 'ask-gora-error-header';

        var iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('class', 'ask-gora-error-icon');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        iconSvg.setAttribute('width', '16');
        iconSvg.setAttribute('height', '16');
        iconSvg.setAttribute('fill', 'none');
        iconSvg.setAttribute('stroke', 'currentColor');
        iconSvg.setAttribute('stroke-width', '2');
        iconSvg.setAttribute('stroke-linecap', 'round');
        iconSvg.setAttribute('stroke-linejoin', 'round');
        iconSvg.setAttribute('aria-hidden', 'true');

        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        iconSvg.appendChild(circle);

        var line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', '12');
        line1.setAttribute('y1', '8');
        line1.setAttribute('x2', '12');
        line1.setAttribute('y2', '12');
        iconSvg.appendChild(line1);

        var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', '12');
        line2.setAttribute('y1', '16');
        line2.setAttribute('x2', '12.01');
        line2.setAttribute('y2', '16');
        iconSvg.appendChild(line2);

        headerEl.appendChild(iconSvg);

        var titleSpan = document.createElement('span');
        titleSpan.className = 'ask-gora-error-title';
        titleSpan.textContent = title;
        headerEl.appendChild(titleSpan);

        bubbleEl.appendChild(headerEl);

        // Friendly error description
        var descP = document.createElement('p');
        descP.className = 'ask-gora-error-text';
        descP.textContent = description;
        bubbleEl.appendChild(descP);

        // Try again button
        var retryBtn = document.createElement('button');
        retryBtn.className = 'ask-gora-retry-btn';
        retryBtn.type = 'button';
        retryBtn.setAttribute('type', 'button');
        retryBtn.setAttribute('aria-label', 'Retry sending your question');

        var retrySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        retrySvg.setAttribute('viewBox', '0 0 24 24');
        retrySvg.setAttribute('width', '14');
        retrySvg.setAttribute('height', '14');
        retrySvg.setAttribute('fill', 'none');
        retrySvg.setAttribute('stroke', 'currentColor');
        retrySvg.setAttribute('stroke-width', '2');
        retrySvg.setAttribute('stroke-linecap', 'round');
        retrySvg.setAttribute('stroke-linejoin', 'round');
        retrySvg.setAttribute('aria-hidden', 'true');

        var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        poly.setAttribute('points', '1 4 1 10 7 10');
        retrySvg.appendChild(poly);

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10');
        retrySvg.appendChild(path);

        retryBtn.appendChild(retrySvg);

        var retryText = document.createElement('span');
        retryText.textContent = 'Try again';
        retryBtn.appendChild(retryText);

        retryBtn.addEventListener('click', function (e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (state.isLoading) return;
            retryBtn.disabled = true;
            retryBtn.classList.add('is-retrying');
            // Remove error message card on retry
            if (msgEl.parentNode) {
                msgEl.parentNode.removeChild(msgEl);
            }
            sendMessage(rawQuery, true);
        });

        bubbleEl.appendChild(retryBtn);
        msgEl.appendChild(bubbleEl);

        var meta = document.createElement('span');
        meta.className = 'ask-gora-msg-meta';
        meta.textContent = 'System notice';
        msgEl.appendChild(meta);

        messagesContainer.appendChild(msgEl);
        scrollToBottom();
    }

    /**
     * Show loading / typing indicator
     */
    function showTypingIndicator() {
        if (!messagesContainer || document.getElementById('askGoraTyping')) return;

        var typingEl = document.createElement('div');
        typingEl.id = 'askGoraTyping';
        typingEl.className = 'ask-gora-typing';
        typingEl.setAttribute('aria-label', 'GORA is thinking');

        for (var i = 0; i < 3; i++) {
            var dot = document.createElement('span');
            dot.className = 'ask-gora-typing-dot';
            typingEl.appendChild(dot);
        }

        messagesContainer.appendChild(typingEl);
        scrollToBottom();
    }

    /**
     * Remove loading / typing indicator
     */
    function hideTypingIndicator() {
        var typingEl = document.getElementById('askGoraTyping');
        if (typingEl && typingEl.parentNode) {
            typingEl.parentNode.removeChild(typingEl);
        }
    }

    /**
     * Update UI loading state
     */
    function setLoading(loading) {
        state.isLoading = loading;
        if (chatInput) {
            chatInput.disabled = loading;
        }
        if (sendBtn) {
            sendBtn.disabled = loading || !chatInput || chatInput.value.trim().length === 0;
        }
        if (loading) {
            showTypingIndicator();
        } else {
            hideTypingIndicator();
            if (chatInput && state.isOpen) {
                chatInput.focus();
            }
        }
    }

    /**
     * Open the chat panel
     */
    function openChat() {
        if (!panel || !launcher) return;
        state.isOpen = true;
        state.isMinimized = false;
        launcher.setAttribute('aria-expanded', 'true');
        launcher.classList.add('is-active');
        panel.removeAttribute('hidden');
        panel.setAttribute('aria-hidden', 'false');
        panel.classList.add('is-open');

        // Body scroll lock on mobile with scroll position preservation
        if (window.innerWidth <= 600) {
            savedScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
            document.body.classList.add('gora-scroll-lock');
        }

        // Scroll immediately to bottom without animated interference
        scrollToBottom(true);
        setTimeout(function () {
            if (chatInput && state.isOpen && !state.isLoading) {
                chatInput.focus();
            }
        }, 80);
    }

    /**
     * Minimize the chat panel (hides panel while completely preserving conversation state, input text, and pending requests)
     */
    function minimizeChat() {
        if (!panel || !launcher) return;

        // Only update UI visibility state - DO NOT reset conversation, history, input, or ongoing requests!
        state.isOpen = false;
        state.isMinimized = true;

        launcher.setAttribute('aria-expanded', 'false');
        launcher.classList.remove('is-active');
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');

        // Remove body scroll lock and restore scroll position if on mobile
        if (document.body.classList.contains('gora-scroll-lock')) {
            document.body.classList.remove('gora-scroll-lock');
            if (savedScrollY > 0) {
                window.scrollTo(0, savedScrollY);
            }
        }

        setTimeout(function () {
            if (!state.isOpen) {
                panel.setAttribute('hidden', '');
            }
        }, 250);

        launcher.focus();
    }

    /**
     * Close the chat panel and completely reset the conversation
     */
    function closeChat() {
        if (!panel || !launcher) return;

        // Invalidate any in-flight request session so late responses are ignored
        currentSessionId++;

        // Abort in-flight network request if active
        if (activeController) {
            try {
                activeController.abort();
            } catch (err) {
                // Ignore abort errors
            }
            activeController = null;
        }

        // Reset conversation state
        state.isOpen = false;
        state.isMinimized = false;
        state.isLoading = false;
        state.lastFailedMessage = null;
        state.history = [];

        // Clear input text and reset composer
        if (chatInput) {
            chatInput.value = '';
            chatInput.style.height = '';
            chatInput.disabled = false;
        }
        if (sendBtn) {
            sendBtn.disabled = true;
        }

        // Remove loading / typing indicators
        hideTypingIndicator();

        // Restore initial welcome message and suggestion chips
        if (messagesContainer && initialMessagesHTML) {
            messagesContainer.innerHTML = initialMessagesHTML;
            messagesContainer.scrollTop = 0;
        }

        launcher.setAttribute('aria-expanded', 'false');
        launcher.classList.remove('is-active');
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');

        // Remove body scroll lock and restore scroll position if on mobile
        if (document.body.classList.contains('gora-scroll-lock')) {
            document.body.classList.remove('gora-scroll-lock');
            if (savedScrollY > 0) {
                window.scrollTo(0, savedScrollY);
            }
        }

        setTimeout(function () {
            if (!state.isOpen) {
                panel.setAttribute('hidden', '');
            }
        }, 250);

        launcher.focus();
    }

    /**
     * Toggle chat panel open / closed
     */
    function toggleChat() {
        if (state.isOpen) {
            minimizeChat();
        } else {
            openChat();
        }
    }

    /**
     * Focus trap for keyboard accessibility
     */
    function handleFocusTrap(e) {
        if (!state.isOpen || !panel) return;
        if (e.key !== 'Tab') return;

        var focusable = panel.querySelectorAll('button:not([disabled]), textarea:not([disabled]), [tabindex="0"]');
        if (focusable.length === 0) return;

        var first = focusable[0];
        var last = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    /**
     * Send user message to Cloudflare Workers AI backend
     */
    function sendMessage(rawText, isRetry) {
        if (!rawText) return;
        var text = rawText.trim();
        if (text.length === 0 || state.isLoading) return;

        // Truncate if exceeds maxChars
        if (text.length > CONFIG.maxChars) {
            text = text.substring(0, CONFIG.maxChars);
        }

        state.lastFailedMessage = text;

        // Only append user bubble if this is not a silent retry
        if (!isRetry) {
            appendMessage('user', text);
        }

        // Clear input
        if (chatInput && !isRetry) {
            chatInput.value = '';
            chatInput.style.height = 'auto';
        }

        setLoading(true);

        var thisSessionId = currentSessionId;

        // Prepare conversation history payload (last 4 turns)
        var recentHistory = state.history.slice(-8);

        // Fetch timeout controller
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        activeController = controller;
        var timeoutId = controller ? setTimeout(function () {
            controller.abort();
        }, CONFIG.timeoutMs) : null;

        var endpoint = CONFIG.apiBase + CONFIG.chatEndpoint;

        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: text,
                history: recentHistory
            }),
            signal: controller ? controller.signal : undefined
        })
        .then(function (res) {
            if (timeoutId) clearTimeout(timeoutId);

            if (res.status === 429) {
                throw new Error('RATE_LIMIT');
            }

            if (!res.ok) {
                throw new Error('HTTP ' + res.status);
            }
            return res.json();
        })
        .then(function (data) {
            if (activeController === controller) activeController = null;
            if (thisSessionId !== currentSessionId) return;
            setLoading(false);

            var assistantText = null;
            if (data && typeof data === 'object') {
                if (typeof data.response === 'string' && data.response.trim().length > 0) {
                    assistantText = data.response.trim();
                } else if (typeof data.reply === 'string' && data.reply.trim().length > 0) {
                    assistantText = data.reply.trim();
                }
            }

            if (assistantText) {
                state.lastFailedMessage = null;
                appendMessage('assistant', assistantText);
                state.history.push({ role: 'user', content: text });
                state.history.push({ role: 'assistant', content: assistantText });
            } else {
                appendErrorCard(
                    'A little hiccup!',
                    'Something went wrong while preparing your answer. Please try again in a moment.',
                    text
                );
            }
        })
        .catch(function (err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (activeController === controller) activeController = null;
            if (thisSessionId !== currentSessionId) return;
            setLoading(false);

            if (err && err.name === 'AbortError' && !state.isLoading) {
                return;
            }

            if (err && err.message === 'RATE_LIMIT') {
                appendErrorCard(
                    'GORA is temporarily busy',
                    'I am receiving high traffic right now. Please wait a moment and try again.',
                    text
                );
            } else {
                appendErrorCard(
                    'A little hiccup!',
                    'Something went wrong while preparing your answer. Please try again in a moment.',
                    text
                );
            }
        });
    }

    /**
     * Auto-resize input textarea as user types with smooth RAF batching
     */
    function handleInputResize() {
        if (!chatInput) return;
        var hasText = chatInput.value.trim().length > 0;
        if (sendBtn) {
            sendBtn.disabled = state.isLoading || !hasText;
        }
        if (!hasText) {
            chatInput.style.height = '';
            return;
        }
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(function () {
            if (!chatInput) return;
            chatInput.style.height = 'auto';
            var newHeight = Math.min(chatInput.scrollHeight, 88);
            chatInput.style.height = newHeight + 'px';
        });
    }

    /**
     * Initialize DOM events and bindings
     */
    function init() {
        launcher = document.getElementById('askGoraLauncher');
        panel = document.getElementById('askGoraPanel');
        minimizeBtn = document.getElementById('askGoraMinimizeBtn');
        closeBtn = document.getElementById('askGoraCloseBtn');
        messagesContainer = document.getElementById('askGoraMessages');
        chatForm = document.getElementById('askGoraForm');
        chatInput = document.getElementById('askGoraInput');
        sendBtn = document.getElementById('askGoraSendBtn');

        if (!launcher || !panel) return;

        // Prevent click events inside panel from bubbling to document
        panel.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        // Toggle on launcher click
        launcher.addEventListener('click', function (e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            toggleChat();
        });

        // Minimize on minimize button click
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', function (e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                minimizeChat();
            });
        }

        // Close on close button click
        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                closeChat();
            });
        }

        // Keyboard focus trap inside open panel (Tab / Shift+Tab)
        // Note: Escape key closing is intentionally disabled per design requirements
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Tab' && state.isOpen) {
                handleFocusTrap(e);
            }
        });

        // Form submit handler
        if (chatForm) {
            chatForm.addEventListener('submit', function (e) {
                e.preventDefault();
                if (chatInput) {
                    sendMessage(chatInput.value);
                }
            });
        }

        // Input keydown handler: Enter to send, Shift+Enter for new line
        if (chatInput) {
            chatInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(chatInput.value);
                }
            });
            chatInput.addEventListener('input', handleInputResize);
        }

        // Cache the pristine initial welcome message and suggested questions markup
        if (messagesContainer) {
            initialMessagesHTML = messagesContainer.innerHTML;

            // Delegated click handler on messagesContainer: handles chips and retry buttons
            // even after conversation reset, with zero risk of duplicate listeners
            messagesContainer.addEventListener('click', function (e) {
                var chip = e.target.closest('.ask-gora-chip');
                if (chip) {
                    e.preventDefault();
                    e.stopPropagation();
                    sendMessage(chip.textContent.trim());
                    return;
                }

                var retryBtn = e.target.closest('.ask-gora-retry-btn');
                if (retryBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (state.isLoading) return;
                    retryBtn.disabled = true;
                    retryBtn.classList.add('is-retrying');
                    var errorCard = retryBtn.closest('.ask-gora-msg-error');
                    if (errorCard && errorCard.parentNode) {
                        errorCard.parentNode.removeChild(errorCard);
                    }
                    if (state.lastFailedMessage) {
                        sendMessage(state.lastFailedMessage, true);
                    }
                }
            });
        }

        // Window resize handler: debounced via RAF
        var windowResizeRaf = null;
        window.addEventListener('resize', function () {
            if (windowResizeRaf) cancelAnimationFrame(windowResizeRaf);
            windowResizeRaf = requestAnimationFrame(function () {
                if (!state.isOpen) return;
                var isMobile = window.innerWidth <= 600;
                var hasLock = document.body.classList.contains('gora-scroll-lock');
                if (isMobile && !hasLock) {
                    savedScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
                    document.body.classList.add('gora-scroll-lock');
                } else if (!isMobile && hasLock) {
                    document.body.classList.remove('gora-scroll-lock');
                }
            });
        });
    }

    // Expose programmatic controls and state inspection
    if (typeof window !== 'undefined') {
        window.AskGORA = {
            open: openChat,
            minimize: minimizeChat,
            close: closeChat,
            getState: function () {
                return {
                    isOpen: state.isOpen,
                    isMinimized: state.isMinimized,
                    isLoading: state.isLoading,
                    historyLength: state.history.length,
                    lastFailedMessage: state.lastFailedMessage
                };
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

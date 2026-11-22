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

    // Test hook: allows the Playwright suite to shorten the request timeout.
    function getTimeoutMs() {
        var override = typeof window !== 'undefined' ? Number(window.GORA_TIMEOUT_MS) : NaN;
        return override > 0 ? override : CONFIG.timeoutMs;
    }

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
    var activeRequest = null; // { stop } for the answer being generated
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
     * Safe Markdown subset renderer for assistant text.
     * Builds DOM nodes with textContent only (never innerHTML), so model output can never inject
     * markup or scripts. Supported: paragraphs, "- "/"* " bullet lists, "1." numbered lists,
     * "#"-"###" headings (rendered as bold lines), **bold**, `inline code`, [label](https://url),
     * bare https:// URLs, and ``` fenced code blocks with a Copy button. Links must be http(s).
     */
    function makeLink(href, label) {
        var a = document.createElement('a');
        a.href = href;
        a.textContent = label;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return a;
    }

    function appendInline(parent, text) {
        var tokenRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
        var lastIndex = 0;
        var match;
        while ((match = tokenRegex.exec(text)) !== null) {
            if (match.index > lastIndex) parent.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
            if (match[1] && match[2]) {
                parent.appendChild(makeLink(match[2], match[1]));
            } else if (match[3]) {
                var strong = document.createElement('strong');
                strong.textContent = match[3];
                parent.appendChild(strong);
            } else if (match[4]) {
                var code = document.createElement('code');
                code.className = 'ask-gora-inline-code';
                code.textContent = match[4];
                parent.appendChild(code);
            } else if (match[5]) {
                parent.appendChild(makeLink(match[5], match[5]));
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) parent.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    function appendCodeBlock(container, codeText, lang) {
        var wrap = document.createElement('div');
        wrap.className = 'ask-gora-code';
        var bar = document.createElement('div');
        bar.className = 'ask-gora-code-bar';
        var label = document.createElement('span');
        label.textContent = lang || 'code';
        var copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'ask-gora-copy-btn';
        copy.setAttribute('aria-label', 'Copy code to clipboard');
        copy.textContent = 'Copy';
        bar.appendChild(label);
        bar.appendChild(copy);
        var pre = document.createElement('pre');
        var code = document.createElement('code');
        code.textContent = codeText;
        pre.appendChild(code);
        wrap.appendChild(bar);
        wrap.appendChild(pre);
        container.appendChild(wrap);
    }

    function renderFormattedContent(container, text) {
        var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
        var list = null;
        var listType = '';
        var i = 0;
        function closeList() { list = null; listType = ''; }
        while (i < lines.length) {
            var line = lines[i];
            var fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
            if (fence) {
                closeList();
                var codeLines = [];
                i++;
                while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { codeLines.push(lines[i]); i++; }
                appendCodeBlock(container, codeLines.join('\n'), fence[1]);
                i++; // skip the closing fence (or the end of an unterminated block while streaming)
                continue;
            }
            var trimmed = line.trim();
            if (!trimmed) { closeList(); i++; continue; }
            var bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
            var numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
            if (bullet || numbered) {
                var type = bullet ? 'ul' : 'ol';
                if (!list || listType !== type) {
                    list = document.createElement(type);
                    listType = type;
                    if (numbered && numbered[1] !== '1') list.setAttribute('start', numbered[1]);
                    container.appendChild(list);
                }
                var li = document.createElement('li');
                appendInline(li, bullet ? bullet[1] : numbered[2]);
                list.appendChild(li);
                i++;
                continue;
            }
            closeList();
            var heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
            var p = document.createElement('p');
            if (heading) {
                var strong = document.createElement('strong');
                appendInline(strong, heading[1]);
                p.appendChild(strong);
            } else {
                appendInline(p, trimmed);
            }
            container.appendChild(p);
            i++;
        }
    }

    function copyToClipboard(text, button) {
        function done(ok) {
            button.textContent = ok ? 'Copied' : 'Copy failed';
            setTimeout(function () { button.textContent = 'Copy'; }, 1600);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
            return;
        }
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            done(ok);
        } catch (e) {
            done(false);
        }
    }

    /* Conversation persistence (privacy-conscious): the current conversation is kept in
       sessionStorage, which belongs to this browser tab only, is never sent anywhere except as
       the usual context with the visitor's next question, survives a refresh or moving between
       the homepage and the portfolio, and is deleted when the tab closes or the visitor presses
       Close (which resets the conversation). */
    var STORAGE_KEY = 'askGora:conversation:v1';
    var MAX_STORED_MESSAGES = 20;

    // Recruiter hand-off (Phase 4.2): after an answer about hiring, contact or availability, or one that
    // says the information is not available, offer the public contact routes the portfolio already lists.
    var HANDOFF_LINKS = [
        { label: 'Resume (PDF)', href: '/portfolio/resume/resume.pdf', external: true },
        { label: 'Email', href: 'mailto:raghavendrayadavgolla@gmail.com' },
        { label: 'LinkedIn', href: 'https://www.linkedin.com/in/raghavendragolla', external: true },
        { label: 'Contact form', href: '/portfolio/#contact', sameSiteSection: true }
    ];
    // "resume" (with or without accents) is matched by its stem: an accented letter is not a regex word
    // character, so it sits outside the \b group, and the accent is written as \u00e9 so this file stays
    // within the characters of the subset web fonts.
    var HANDOFF_INTENT = /\b(hire|hiring|recruit\w*|interview\w*|cv|contact|email|reach|availab\w*|role|roles|position|positions|job|jobs|opening|openings|fit|salary|visa|relocat\w*|notice)\b|\br(?:e|\u00e9)sum/i;
    var NOT_AVAILABLE_TEXT = 'not available in Raghavendra';
    var OUT_OF_SCOPE_TEXT = 'can only help with questions about his background';
    var MAX_INPUT_CHARS = 400;
    var COUNTER_THRESHOLD = 320;

    function shouldOfferHandoff(question, answer) {
        if (typeof answer !== 'string' || !answer || answer.indexOf(OUT_OF_SCOPE_TEXT) !== -1) return false;
        return answer.indexOf(NOT_AVAILABLE_TEXT) !== -1 || HANDOFF_INTENT.test(question || '');
    }

    function appendHandoff(msgEl) {
        if (!msgEl || msgEl.querySelector('.ask-gora-handoff')) return;
        var box = document.createElement('div');
        box.className = 'ask-gora-handoff';
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', 'Contact Raghavendra');
        for (var i = 0; i < HANDOFF_LINKS.length; i++) {
            var item = HANDOFF_LINKS[i];
            var a = document.createElement('a');
            a.className = 'ask-gora-handoff-link';
            a.href = item.href;
            a.textContent = item.label;
            if (item.external) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            }
            if (item.sameSiteSection) a.setAttribute('data-gora-section-link', '');
            box.appendChild(a);
        }
        var meta = msgEl.querySelector('.ask-gora-msg-meta');
        msgEl.insertBefore(box, meta);
    }

    // A link to a section of the page the visitor is already on: minimize the panel first, then jump
    // once the panel's own history entry has been popped (otherwise that pop would undo the jump).
    function goToSection(href) {
        var url = new URL(href, window.location.href);
        if (url.pathname !== window.location.pathname) return false; // other page: normal navigation
        var hadEntry = !!(window.history.state && window.history.state.askGoraOpen);
        var jumped = false;
        var jump = function () {
            if (jumped) return;
            jumped = true;
            window.removeEventListener('popstate', jump);
            window.location.hash = url.hash;
        };
        if (hadEntry) {
            window.addEventListener('popstate', jump);
            setTimeout(jump, 400);
        }
        minimizeChat();
        if (!hadEntry) jump();
        return true;
    }

    function saveConversation() {
        try {
            if (!state.history.length) { window.sessionStorage.removeItem(STORAGE_KEY); return; }
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, history: state.history.slice(-MAX_STORED_MESSAGES) }));
        } catch (e) { /* storage disabled or full: the chat still works without it */ }
    }

    function clearSavedConversation() {
        try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }

    function restoreConversation() {
        var saved = null;
        try { saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
        if (!saved || !Array.isArray(saved.history)) return;
        var restored = saved.history.filter(function (m) {
            return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0;
        }).slice(-MAX_STORED_MESSAGES);
        if (!restored.length) return;
        state.history = restored;
        var lastQuestion = '';
        for (var i = 0; i < restored.length; i++) {
            var msgEl = appendMessage(restored[i].role, restored[i].content);
            if (restored[i].role === 'user') lastQuestion = restored[i].content;
            else if (shouldOfferHandoff(lastQuestion, restored[i].content)) appendHandoff(msgEl);
        }
    }

    /**
     * Append a message bubble to the chat log
     */
    /** Creates an empty assistant bubble that a streamed answer is rendered into. */
    function createAssistantBubble() {
        var msgEl = document.createElement('div');
        msgEl.className = 'ask-gora-msg ask-gora-msg-assistant is-streaming';
        var bubbleEl = document.createElement('div');
        bubbleEl.className = 'ask-gora-msg-bubble';
        msgEl.appendChild(bubbleEl);
        var meta = document.createElement('span');
        meta.className = 'ask-gora-msg-meta';
        meta.textContent = 'GORA';
        msgEl.appendChild(meta);
        messagesContainer.appendChild(msgEl);
        return { msgEl: msgEl, bubbleEl: bubbleEl, meta: meta };
    }

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
        return msgEl;
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
    // While an answer is being generated the send button becomes a Stop button
    // (same element and position; only its icon and accessible name change).
    var sendIcon = null;
    var stopIcon = null;
    function setSendButtonMode(stopMode) {
        if (!sendBtn) return;
        if (!sendIcon) sendIcon = sendBtn.querySelector('svg');
        if (!stopIcon) {
            stopIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            stopIcon.setAttribute('viewBox', '0 0 24 24');
            stopIcon.setAttribute('width', '16');
            stopIcon.setAttribute('height', '16');
            stopIcon.setAttribute('aria-hidden', 'true');
            var sq = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            sq.setAttribute('x', '6');
            sq.setAttribute('y', '6');
            sq.setAttribute('width', '12');
            sq.setAttribute('height', '12');
            sq.setAttribute('rx', '2');
            sq.setAttribute('fill', 'currentColor');
            stopIcon.appendChild(sq);
        }
        var current = sendBtn.querySelector('svg');
        var wanted = stopMode ? stopIcon : sendIcon;
        if (current && wanted && current !== wanted) sendBtn.replaceChild(wanted, current);
        sendBtn.classList.toggle('is-stop', stopMode);
        sendBtn.setAttribute('aria-label', stopMode ? 'Stop generating' : 'Send message');
    }

    function setLoading(loading) {
        state.isLoading = loading;
        if (chatInput) {
            chatInput.disabled = loading;
        }
        setSendButtonMode(loading);
        if (sendBtn) {
            sendBtn.disabled = loading ? false : (!chatInput || chatInput.value.trim().length === 0);
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
     * Apply the full chatbot stylesheet on first intent.
     * chatbot.css never blocks first paint; the critical launcher
     * styles are inline in the page. Applying it here, instead of during page load, keeps its
     * one-off style recalculation out of the load window.
     *
     * During page load the document only carries a low-priority <link rel="prefetch"> hint (marked
     * data-gora-css), which downloads the file without involving the style engine. On first intent
     * the real stylesheet is inserted right after that hint, i.e. at the same position in <head>, so
     * the cascade order is exactly what it was when chatbot.css was a normal render-blocking link.
     * If the chat is opened while the file is still loading (normally a few ms from cache), opening
     * completes on its load event, so the panel is first rendered with its final styles.
     */
    var stylesState = 'idle'; // 'idle' | 'loading' | 'ready'
    var pendingOpen = false;

    // Browser history length last seen by the Back-button handling (see init / popstate).
    var knownHistoryLength = 0;

    function activateStyles() {
        if (stylesState !== 'idle') return;
        var hint = document.querySelector('link[data-gora-css]');
        if (!hint) {
            stylesState = 'ready'; // no deferred stylesheet on this page (e.g. loaded normally)
            return;
        }
        hint.removeAttribute('data-gora-css');
        stylesState = 'loading';
        var sheet = document.createElement('link');
        sheet.rel = 'stylesheet';
        sheet.href = hint.getAttribute('href');
        sheet.onload = sheet.onerror = function () {
            stylesState = 'ready';
            if (pendingOpen) {
                pendingOpen = false;
                openChat();
            }
        };
        hint.parentNode.insertBefore(sheet, hint.nextSibling);
    }

    /**
     * Open the chat panel
     */
    // History API: the panel gets its own history entry so mobile swipe-back or browser Back
    // minimizes it instead of leaving the page. The entry is pushed synchronously inside the
    // visitor's tap/click (also when the panel itself still waits for chatbot.css), so it is
    // created with user activation and before any asynchronous work.
    function pushPanelHistoryEntry() {
        if (typeof window === 'undefined' || !window.history) return;
        if (!window.history.state || !window.history.state.askGoraOpen) {
            try {
                window.history.pushState({ askGoraOpen: true }, '');
            } catch (e) {
                // Ignore history errors if restricted
            }
        }
        knownHistoryLength = window.history.length;
    }

    function openChat() {
        if (!panel || !launcher) return;
        activateStyles();
        pushPanelHistoryEntry();
        if (stylesState === 'loading') {
            pendingOpen = true;
            return;
        }
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
    function minimizeChat(fromPopstate) {
        if (!panel || !launcher) return;
        pendingOpen = false; // an open waiting for chatbot.css to load is cancelled

        // Clean up history state if closed via on-screen button rather than popstate
        if (!fromPopstate && typeof window !== 'undefined' && window.history && window.history.state && window.history.state.askGoraOpen) {
            try {
                window.history.back();
            } catch (err) {
                // Ignore history errors
            }
        }

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
    function closeChat(fromPopstate) {
        if (!panel || !launcher) return;
        pendingOpen = false; // an open waiting for chatbot.css to load is cancelled

        // Clean up history state if closed via on-screen button rather than popstate
        if (!fromPopstate && typeof window !== 'undefined' && window.history && window.history.state && window.history.state.askGoraOpen) {
            try {
                window.history.back();
            } catch (err) {
                // Ignore history errors
            }
        }

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
        activeRequest = null;
        clearSavedConversation();

        // Clear input text and reset composer
        if (chatInput) {
            chatInput.value = '';
            chatInput.style.height = '';
            chatInput.disabled = false;
            updateInputCounter();
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
        // Duplicate-submission guard: one request at a time (Enter, button, chips and retry all pass here).
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
            updateInputCounter();
        }

        setLoading(true);

        var thisSessionId = currentSessionId;

        // Conversation context: the last 8 messages (the Worker keeps at most 6 within its character budget).
        var recentHistory = state.history.slice(-8);

        // Abort controller shared by the timeout, the Stop button and Close.
        // `timedOut` / `stopped` record WHY the request was aborted.
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        activeController = controller;
        var timedOut = false;
        var stopped = false;
        var timeoutMs = getTimeoutMs();
        var timeoutId = null;
        function armTimeout() {
            // First the wait for the first text, then the longest silence allowed between streamed chunks.
            if (!controller) return;
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(function () {
                timedOut = true;
                controller.abort();
            }, timeoutMs);
        }
        armTimeout();
        activeRequest = {
            stop: function () {
                stopped = true;
                if (controller) controller.abort();
            }
        };

        var answer = '';
        var streamErrorCode = '';
        var bubble = null;
        var renderQueued = false;
        function renderStream() {
            renderQueued = false;
            if (!bubble || thisSessionId !== currentSessionId) return;
            while (bubble.bubbleEl.firstChild) bubble.bubbleEl.removeChild(bubble.bubbleEl.firstChild);
            renderFormattedContent(bubble.bubbleEl, answer);
            scrollToBottom();
        }
        function onDelta(delta) {
            if (thisSessionId !== currentSessionId) return;
            answer += delta;
            armTimeout();
            if (!bubble) {
                hideTypingIndicator();
                bubble = createAssistantBubble();
            }
            if (!renderQueued) {
                // Render at most once per frame; the timer is a backstop for engines or tabs where
                // animation frames are throttled, so streamed text still appears incrementally.
                renderQueued = true;
                var fired = false;
                var run = function () { if (fired) return; fired = true; renderStream(); };
                if (window.requestAnimationFrame) window.requestAnimationFrame(run);
                setTimeout(run, 120);
            }
        }

        // Reads the Worker's server-sent events: `data: {...}` lines carrying either a Workers AI
        // `response` token, an OpenAI-style `choices[0].delta.content`, or an `error_code` from the Worker.
        // Only visible answer text is used; reasoning fields are ignored.
        function readStream(reader) {
            var decoder = new TextDecoder();
            var buffer = '';
            var finished = false;
            function handleLine(line) {
                line = line.trim();
                if (line.indexOf('data:') !== 0) return;
                var payload = line.slice(5).trim();
                if (!payload) return;
                if (payload === '[DONE]') { finished = true; return; }
                var event;
                try { event = JSON.parse(payload); } catch (e) { return; }
                if (!event || typeof event !== 'object') return;
                if (typeof event.error_code === 'string') { streamErrorCode = event.error_code; return; }
                var delta = '';
                if (typeof event.response === 'string') {
                    delta = event.response;
                } else if (event.choices && event.choices[0] && event.choices[0].delta && typeof event.choices[0].delta.content === 'string') {
                    delta = event.choices[0].delta.content;
                }
                if (delta) onDelta(delta);
            }
            function pump() {
                return reader.read().then(function (chunk) {
                    if (chunk.done || finished) {
                        if (buffer.trim()) handleLine(buffer);
                        return { streamed: true };
                    }
                    buffer += decoder.decode(chunk.value, { stream: true });
                    var newline;
                    while ((newline = buffer.indexOf('\n')) >= 0) {
                        handleLine(buffer.slice(0, newline));
                        buffer = buffer.slice(newline + 1);
                    }
                    return pump();
                });
            }
            return pump();
        }

        function finishPartial(note) {
            // Keeps whatever was already streamed: rendered in full, labelled, and remembered as context.
            if (!bubble || !answer.trim()) return false;
            renderStream();
            bubble.msgEl.classList.remove('is-streaming');
            bubble.meta.textContent = note ? 'GORA · ' + note : 'GORA';
            if (!note && shouldOfferHandoff(text, answer)) appendHandoff(bubble.msgEl);
            state.history.push({ role: 'user', content: text });
            state.history.push({ role: 'assistant', content: answer.trim() });
            saveConversation();
            return true;
        }

        function cleanup() {
            if (timeoutId) clearTimeout(timeoutId);
            if (activeController === controller) activeController = null;
            activeRequest = null;
        }

        var endpoint = CONFIG.apiBase + CONFIG.chatEndpoint;

        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream, application/json'
            },
            body: JSON.stringify({
                message: text,
                history: recentHistory,
                stream: true
            }),
            signal: controller ? controller.signal : undefined
        })
        .then(function (res) {
            var type = (res.headers && res.headers.get('Content-Type')) || '';
            if (res.ok && type.indexOf('text/event-stream') !== -1 && res.body && typeof res.body.getReader === 'function' && typeof TextDecoder !== 'undefined') {
                return readStream(res.body.getReader());
            }
            // JSON: error responses (they may carry an `error_code` and a visitor-friendly
            // `fallbackReply`) and non-streaming replies.
            return res.json().catch(function () { return null; }).then(function (data) {
                if (!res.ok) {
                    var httpErr = new Error(res.status === 429 ? 'RATE_LIMIT' : 'HTTP ' + res.status);
                    httpErr.status = res.status;
                    httpErr.data = data;
                    throw httpErr;
                }
                return { json: data };
            });
        })
        .then(function (result) {
            cleanup();
            if (thisSessionId !== currentSessionId) return;
            setLoading(false);

            if (result && result.streamed) {
                // Depending on the browser, an aborted stream can end normally instead of throwing.
                if (stopped) {
                    if (!finishPartial('stopped')) state.lastFailedMessage = null;
                    return;
                }
                if (timedOut) {
                    finishPartial('answer incomplete');
                    appendErrorCard(
                        'GORA is taking longer than usual',
                        'The answer did not arrive within ' + Math.round(timeoutMs / 1000) + ' seconds. Please try again in a moment.',
                        text
                    );
                    return;
                }
                if (streamErrorCode && streamErrorCode !== 'EMPTY_RESPONSE' && answer.trim()) {
                    finishPartial('answer interrupted');
                    appendErrorCard('The answer was cut short', 'The connection to GORA was interrupted. You can try the question again.', text);
                    return;
                }
                if (finishPartial('')) {
                    state.lastFailedMessage = null;
                    return;
                }
                appendErrorCard(
                    'A little hiccup!',
                    'Something went wrong while preparing your answer. Please try again in a moment.',
                    text
                );
                return;
            }

            var data = result ? result.json : null;
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
                var answerEl = appendMessage('assistant', assistantText);
                if (shouldOfferHandoff(text, assistantText)) appendHandoff(answerEl);
                state.history.push({ role: 'user', content: text });
                state.history.push({ role: 'assistant', content: assistantText });
                saveConversation();
            } else {
                appendErrorCard(
                    'A little hiccup!',
                    'Something went wrong while preparing your answer. Please try again in a moment.',
                    text
                );
            }
        })
        .catch(function (err) {
            cleanup();
            // Conversation was closed (or reset) while this request was in flight: ignore it.
            if (thisSessionId !== currentSessionId) return;
            setLoading(false);

            if (err && err.name === 'AbortError') {
                if (stopped) {
                    // Visitor pressed Stop: keep what was generated so far, no error card.
                    if (!finishPartial('stopped')) state.lastFailedMessage = null;
                    return;
                }
                if (!timedOut) return; // aborted deliberately elsewhere; nothing to report
                finishPartial('answer incomplete');
                appendErrorCard(
                    'GORA is taking longer than usual',
                    'The answer did not arrive within ' + Math.round(timeoutMs / 1000) + ' seconds. Please try again in a moment.',
                    text
                );
                return;
            }

            if (bubble && answer.trim()) {
                // The stream broke after part of the answer arrived (network drop).
                finishPartial('answer interrupted');
                appendErrorCard('The answer was cut short', 'The connection to GORA was interrupted. You can try the question again.', text);
                return;
            }

            var errData = err && err.data && typeof err.data === 'object' ? err.data : null;
            var errCode = errData && typeof errData.error_code === 'string' ? errData.error_code : '';
            var fallbackReply = errData && typeof errData.fallbackReply === 'string' && errData.fallbackReply.trim()
                ? errData.fallbackReply.trim()
                : '';

            // The "resting for today" message is shown ONLY for the two explicit daily-exhaustion
            // codes from the backend; the HTTP status alone never selects it.
            if (errCode === 'DAILY_BUDGET_REACHED' || errCode === 'AI_QUOTA_EXCEEDED') {
                appendErrorCard(
                    'GORA is resting for today',
                    fallbackReply || 'Ask GORA has reached its daily limit. Please explore the portfolio directly or get in touch through the contact details on this page.',
                    text
                );
            } else if (errCode === 'RATE_LIMITED' || errCode === 'AI_BUSY' || (err && err.message === 'RATE_LIMIT' && !errCode)) {
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

    /** Stops the answer that is currently being generated (Stop button). */
    function stopGeneration() {
        if (activeRequest) activeRequest.stop();
    }

    /**
     * Auto-resize input textarea as user types with smooth RAF batching
     */
    // Shows "N/400" once the question gets long, so the 400-character limit is never a silent stop.
    var inputCounter = null;
    var inputLimitStatus = null;
    function updateInputCounter() {
        if (!chatInput || !inputCounter) return;
        var len = chatInput.value.length;
        inputCounter.hidden = len < COUNTER_THRESHOLD;
        inputCounter.textContent = len + '/' + MAX_INPUT_CHARS;
        inputCounter.classList.toggle('is-at-limit', len >= MAX_INPUT_CHARS);
        // Announced once when the limit is reached (not on every keystroke).
        var atLimit = len >= MAX_INPUT_CHARS;
        if (inputLimitStatus && inputLimitStatus.getAttribute('data-at-limit') !== String(atLimit)) {
            inputLimitStatus.setAttribute('data-at-limit', String(atLimit));
            inputLimitStatus.textContent = atLimit ? 'Character limit of ' + MAX_INPUT_CHARS + ' reached.' : '';
        }
    }

    function handleInputResize() {
        if (!chatInput) return;
        updateInputCounter();
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

        // Apply the full stylesheet as soon as the visitor shows intent to use the launcher
        // (hover, keyboard focus or touch), so hover/focus styles are ready before the click.
        ['pointerenter', 'pointerdown', 'touchstart', 'focus'].forEach(function (type) {
            launcher.addEventListener(type, activateStyles, { once: true, passive: true });
        });

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
                // While an answer is being generated the send button is the Stop button.
                if (state.isLoading) {
                    stopGeneration();
                    return;
                }
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
            // Phone keyboards label Enter as "Send" (Enter already sends; Shift+Enter adds a line).
            chatInput.setAttribute('enterkeyhint', 'send');
            if (chatForm && !inputCounter) {
                inputCounter = document.createElement('span');
                inputCounter.className = 'ask-gora-counter';
                inputCounter.setAttribute('aria-hidden', 'true');
                inputCounter.hidden = true;
                chatForm.appendChild(inputCounter);
                inputLimitStatus = document.createElement('span');
                inputLimitStatus.className = 'sr-only';
                inputLimitStatus.setAttribute('role', 'status');
                chatForm.appendChild(inputLimitStatus);
            }
        }

        // Cache the pristine initial welcome message and suggested questions markup
        if (messagesContainer) {
            initialMessagesHTML = messagesContainer.innerHTML;

            // Bring back this tab's conversation after a refresh or a move between pages.
            restoreConversation();

            // Delegated click handler on messagesContainer: handles chips and retry buttons
            // even after conversation reset, with zero risk of duplicate listeners
            messagesContainer.addEventListener('click', function (e) {
                var copyBtn = e.target.closest('.ask-gora-copy-btn');
                if (copyBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    var codeEl = copyBtn.closest('.ask-gora-code') && copyBtn.closest('.ask-gora-code').querySelector('code');
                    if (codeEl) copyToClipboard(codeEl.textContent, copyBtn);
                    return;
                }

                var sectionLink = e.target.closest('[data-gora-section-link]');
                if (sectionLink && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                    if (goToSection(sectionLink.getAttribute('href'))) e.preventDefault();
                    return;
                }

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

        // Clean up any stale history state if page was refreshed while Ask GORA was open
        if (typeof window !== 'undefined' && window.history && window.history.state && window.history.state.askGoraOpen) {
            try {
                window.history.replaceState({ askGoraOpen: false }, '');
            } catch (err) {
                // Ignore history errors
            }
        }

        // History API popstate handler: intercept mobile back-swipe / browser Back
        // to minimize the chat panel instead of exiting the page.
        //  - Landing on an entry WITHOUT the chat marker while the panel is open: Back left the
        //    panel's entry, so minimize it.
        //  - Landing ON the panel's own entry while it is open (e.g. Back from an in-page anchor
        //    followed while chatting): the panel belongs there, so keep it open.
        //  - Landing on a panel entry while the panel is closed (stale or Forward): neutralize the
        //    marker instead of reopening, so a later Minimize/Close never pops the wrong entry.
        //  - A popstate that comes with a NEW history entry (history.length grew) is in-page
        //    navigation such as an #anchor link, not Back/Forward: leave the panel as it is.
        knownHistoryLength = window.history.length;
        window.addEventListener('popstate', function () {
            var lengthNow = window.history.length;
            var addedEntry = lengthNow > knownHistoryLength;
            knownHistoryLength = lengthNow;
            if (addedEntry) return;

            var historyState = window.history.state;
            var onPanelEntry = !!(historyState && historyState.askGoraOpen);
            // Back pressed while the panel was still waiting for its stylesheet: cancel the open.
            if (pendingOpen && !onPanelEntry) {
                pendingOpen = false;
                return;
            }
            if (onPanelEntry) {
                if (!state.isOpen) {
                    try {
                        window.history.replaceState(Object.assign({}, historyState, { askGoraOpen: false }), '');
                    } catch (err) {
                        // Ignore history errors
                    }
                }
                return;
            }
            if (state.isOpen) {
                minimizeChat(true);
            }
        });
    }

    // Expose programmatic controls and state inspection
    if (typeof window !== 'undefined') {
        window.AskGORA = {
            open: openChat,
            minimize: minimizeChat,
            close: closeChat,
            stop: stopGeneration,
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

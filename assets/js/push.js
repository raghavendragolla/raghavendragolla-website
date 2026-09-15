// Career Radar Web Push pairing.
//
// This site (raghavendragolla.com) already has an installed PWA and a
// registered service worker (sw.js). Career Radar (a different origin,
// career.raghavendragolla.com) sends push notifications through that
// existing subscription rather than creating a second app/service worker.
//
// A visit here only does anything if it carries a one-time ?pair_token=
// minted by an already-authenticated Career Radar session. Without a valid
// token, this script does nothing visible — ordinary portfolio visitors
// never see the banner. No Career Radar secret of any kind lives in this
// file: only the public VAPID key (fetched at runtime, not secret) and the
// short-lived pairing token passed through the URL are ever handled here.
(function () {
    var CAREER_RADAR_ORIGIN = 'https://career.raghavendragolla.com';
    var STORAGE_KEY = 'rg:push-subscribed';

    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData = window.atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function cleanPairTokenFromUrl() {
        var url = new URL(window.location.href);
        url.searchParams.delete('pair_token');
        window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
    }

    async function subscribeWithToken(pairToken, subtitleEl) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            subtitleEl.textContent = 'Push notifications are not supported in this browser.';
            return;
        }

        if (isIOS() && !isStandalone()) {
            subtitleEl.textContent = 'Please open this from your installed home-screen app, then try again.';
            return;
        }

        var permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            subtitleEl.textContent = 'Notification permission was not granted.';
            return;
        }

        try {
            var keyRes = await fetch(CAREER_RADAR_ORIGIN + '/api/push/vapid-public-key');
            if (!keyRes.ok) {
                subtitleEl.textContent = 'Career Radar push is not currently available.';
                return;
            }
            var keyData = await keyRes.json();

            var registration = await navigator.serviceWorker.ready;
            var subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyData.public_key)
            });

            var subRes = await fetch(CAREER_RADAR_ORIGIN + '/api/push/subscribe', {
                method: 'POST',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pairing_token: pairToken,
                    subscription: {
                        endpoint: subscription.endpoint,
                        keys: {
                            p256dh: arrayBufferToBase64Url(subscription.getKey('p256dh')),
                            auth: arrayBufferToBase64Url(subscription.getKey('auth'))
                        }
                    }
                })
            });

            if (!subRes.ok) {
                subtitleEl.textContent = 'This link has expired or was already used. Please request a new one from Career Radar.';
                return;
            }

            try { window.rgStorage && window.rgStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
            subtitleEl.textContent = 'Job alerts enabled on this device.';
        } catch (err) {
            console.warn('Push subscription failed:', err);
            subtitleEl.textContent = 'Something went wrong enabling notifications. Please try again.';
        }
    }

    function arrayBufferToBase64Url(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        for (var i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function init() {
        var params = new URLSearchParams(window.location.search);
        var pairToken = params.get('pair_token');
        if (!pairToken) return;

        var banner = document.getElementById('pushPairingBanner');
        var subtitleEl = document.getElementById('pushPairingSubtitle');
        var enableBtn = document.getElementById('pushPairingEnableBtn');
        var dismissBtn = document.getElementById('pushPairingDismissBtn');
        if (!banner || !enableBtn) return;

        banner.classList.add('show');

        enableBtn.addEventListener('click', function () {
            enableBtn.disabled = true;
            subtitleEl.textContent = 'Enabling...';
            subscribeWithToken(pairToken, subtitleEl).finally(function () {
                enableBtn.disabled = false;
                cleanPairTokenFromUrl();
            });
        });

        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                banner.classList.remove('show');
                cleanPairTokenFromUrl();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

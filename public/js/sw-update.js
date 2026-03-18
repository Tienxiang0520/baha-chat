(function () {
    if (!('serviceWorker' in navigator)) return;

    const banner = document.getElementById('sw-update-banner');
    const updateBtn = document.getElementById('sw-update-btn');
    let isReloading = false;

    function showUpdateBanner(registration) {
        if (!banner || !registration?.waiting) return;
        banner.classList.remove('hidden');
        if (updateBtn) {
            updateBtn.onclick = () => registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (isReloading) return;
        isReloading = true;
        window.location.reload();
    });

    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            if (registration.waiting) {
                showUpdateBanner(registration);
            }
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateBanner(registration);
                    }
                });
            });
        } catch (error) {
            console.log('ServiceWorker 註冊失敗: ', error);
        }
    });
})();

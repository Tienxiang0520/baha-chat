(function () {
    const banner = document.getElementById('admin-key-banner');
    const textEl = document.getElementById('admin-key-text');
    const copyBtn = document.getElementById('admin-key-copy');
    const closeBtn = document.getElementById('admin-key-close');

    function show(token) {
        if (!banner || !textEl) return;
        textEl.textContent = token;
        banner.classList.remove('hidden');
    }

    function hide() {
        if (!banner || !textEl) return;
        banner.classList.add('hidden');
        textEl.textContent = '';
    }

    async function copyToken() {
        if (!textEl?.textContent) return;
        try {
            await window.copyToClipboard(textEl.textContent);
        } catch (error) {
            console.error('複製管理金鑰失敗', error);
        }
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            await copyToken();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (event) => {
            event.preventDefault();
            hide();
        });
    }

    window.AdminKeyBanner = { show, hide };
})();

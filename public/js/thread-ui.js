(function () {
    const banner = document.getElementById('thread-banner');
    const parentName = document.getElementById('thread-parent-name');
    const backBtn = document.getElementById('thread-back-btn');
    let backCallback = null;

    function update(parentRoom, displayName = '', threadTitle = '') {
        if (!banner || !parentName) return;
        if (parentRoom) {
            parentName.textContent = displayName || parentRoom;
            banner.classList.remove('hidden');
            banner.dataset.threadTitle = threadTitle || '';
        } else {
            banner.classList.add('hidden');
            banner.dataset.threadTitle = '';
        }
    }

    function setBackCallback(callback) {
        backCallback = callback;
        if (!backBtn) return;
        backBtn.onclick = (event) => {
            event.preventDefault();
            backCallback?.();
        };
    }

    window.ThreadUI = {
        update,
        hide: () => update(null),
        setBackCallback
    };
})();

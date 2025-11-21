/* tools/extractor/script.js - 最終修正版 */

/**
 * コアなSpine描画・ロードロジックは render/spine-viewer.js に含まれているため、
 * このファイルにはテーマ切り替えやUI制御などの拡張機能を実装する。
 */

// --- Theme Logic ---
function applyTheme(themeName) {
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');

    body.classList.remove('theme-dark', 'theme-light');

    if (themeName === 'dark') {
        body.classList.add('theme-dark');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="sun"></i>';
    } else {
        body.classList.add('theme-light');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="moon"></i>';
    }

    localStorage.setItem('theme', themeName);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme(prefersDark ? 'dark' : 'light');
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('theme-dark');
    applyTheme(isDark ? 'light' : 'dark');
}

// --- Custom Select Logic ---
// 標準の <select> を高機能なカスタムセレクトに変換する
function initCustomSelects() {
    const selects = document.querySelectorAll('.styled-select');

    selects.forEach(select => {
        // 既に初期化済みならスキップ
        if (select.parentElement.classList.contains('custom-select-wrapper')) return;

        // ラッパーを作成
        const wrapper = document.createElement('div');
        wrapper.classList.add('custom-select-wrapper');
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);

        // 元のセレクトを隠す
        select.style.display = 'none';

        // トリガー（表示部分）を作成
        const trigger = document.createElement('div');
        trigger.classList.add('custom-select-trigger');
        trigger.innerHTML = `<span>${select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : 'Select'}</span>`;
        wrapper.appendChild(trigger);

        // ドロップダウンリストを作成
        const customOptions = document.createElement('div');
        customOptions.classList.add('custom-options');
        wrapper.appendChild(customOptions);

        // オプションを更新する関数
        const updateOptions = () => {
            customOptions.innerHTML = '';
            if (select.options.length === 0) return;

            // 現在の選択値を反映
            trigger.querySelector('span').textContent = select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : '';

            Array.from(select.options).forEach(option => {
                const customOption = document.createElement('div');
                customOption.classList.add('custom-option');
                customOption.textContent = option.textContent;
                customOption.dataset.value = option.value;

                if (option.selected) {
                    customOption.classList.add('selected');
                }

                customOption.addEventListener('click', () => {
                    // 選択状態の更新
                    wrapper.classList.remove('open');

                    // 元のselectを更新
                    select.value = option.value;
                    select.dispatchEvent(new Event('change'));

                    // UI更新
                    trigger.querySelector('span').textContent = option.textContent;
                    customOptions.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                    customOption.classList.add('selected');
                });

                customOptions.appendChild(customOption);
            });
        };

        // 初回更新
        updateOptions();

        // 元のselectの変更を監視 (Spineビューワーがoptionを追加するのを検知)
        const observer = new MutationObserver(updateOptions);
        observer.observe(select, { childList: true, subtree: true });

        // valueの変更も監視したいがMutationObserverでは不可なので、
        // changeイベントをリッスンしてUIを同期（外部からの変更用）
        select.addEventListener('change', () => {
            trigger.querySelector('span').textContent = select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : '';
            customOptions.querySelectorAll('.custom-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.value === select.value);
            });
        });

        // トリガーのクリックイベント
        trigger.addEventListener('click', (e) => {
            // 他のセレクトボックスを閉じる
            document.querySelectorAll('.custom-select-wrapper').forEach(wrap => {
                if (wrap !== wrapper) wrap.classList.remove('open');
            });
            wrapper.classList.toggle('open');
            e.stopPropagation();
        });
    });

    // 画面外クリックで閉じる
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-wrapper')) {
            document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
                wrapper.classList.remove('open');
            });
        }
    });
}

// --- Scroll Mask Logic ---
function initScrollMask() {
    const scrollContainer = document.querySelector('.scroll-content');
    if (!scrollContainer) return;

    const updateMask = () => {
        const scrollTop = scrollContainer.scrollTop;
        const scrollHeight = scrollContainer.scrollHeight;
        const clientHeight = scrollContainer.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        const fadeSize = 60;

        let topAlpha = 1;
        let bottomAlpha = 1;

        if (maxScroll > 0) {
            topAlpha = 1 - Math.min(scrollTop / fadeSize, 1);
            const distanceToBottom = maxScroll - scrollTop;
            bottomAlpha = 1 - Math.min(Math.max(distanceToBottom, 0) / fadeSize, 1);
        }

        scrollContainer.style.setProperty('--mask-top-alpha', topAlpha);
        scrollContainer.style.setProperty('--mask-bottom-alpha', bottomAlpha);
    };

    scrollContainer.addEventListener('scroll', updateMask);
    window.addEventListener('resize', updateMask);

    updateMask();

    const observer = new MutationObserver(updateMask);
    observer.observe(scrollContainer, { childList: true, subtree: true });
}

// --- Slider UI Logic ---
function initSliderSync() {
    const paddingSlider = document.getElementById('snapshot-padding-slider');
    const paddingInput = document.getElementById('snapshot-padding');

    const updateSliderStyle = () => {
        if (paddingSlider) {
            const min = parseFloat(paddingSlider.min) || 0;
            const max = parseFloat(paddingSlider.max) || 100;
            const val = parseFloat(paddingSlider.value) || 0;

            let percentage = ((val - min) / (max - min)) * 100;
            percentage = Math.min(Math.max(percentage, 0), 100);

            paddingSlider.style.backgroundSize = `${percentage}% 100%`;
        }
    };

    if (paddingSlider && paddingInput) {
        updateSliderStyle();

        paddingSlider.addEventListener('input', () => {
            paddingInput.value = paddingSlider.value;
            updateSliderStyle();
        });

        paddingInput.addEventListener('input', () => {
            const val = parseFloat(paddingInput.value);
            if (!isNaN(val)) {
                paddingSlider.value = val;
                updateSliderStyle();
            }
        });
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Theme
    initTheme();
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // UI Components
    initScrollMask();
    initSliderSync();

    // Custom Selects (DOM生成後に実行)
    initCustomSelects();
});
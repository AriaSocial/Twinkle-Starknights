/* tools/extractor/script.js - 最終修正案 (テーマロジックのみ) */

/**
 * コアなSpine描画・ロードロジックは render/spine-viewer.js に含まれているため、
 * このファイルにはテーマ切り替え機能のみを実装する。
 */

function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    // 1. システム設定の確認とローカルストレージの優先
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = localStorage.getItem('theme');

    let isDark = false;

    if (currentTheme) {
        // ローカルストレージに設定がある場合
        isDark = currentTheme === 'dark';
    } else {
        // ローカルストレージに設定がない場合、システム設定に従う
        isDark = prefersDark;
    }

    if (isDark) {
        document.body.classList.add('theme-dark');
        themeToggle.innerHTML = '<i data-lucide="sun"></i>'; // ライトに切り替えるための太陽アイコン
    } else {
        document.body.classList.remove('theme-dark');
        themeToggle.innerHTML = '<i data-lucide="moon"></i>'; // ダークに切り替えるための月アイコン
    }

    // Lucideアイコンを初期化 (themeToggle内のアイコンをSVGに変換)
    // このスクリプトはHTMLの最後にロードされるため、DOM要素の存在を保証できる
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');

    if (body.classList.contains('theme-dark')) {
        // ライトテーマへ切り替え
        body.classList.remove('theme-dark');
        localStorage.setItem('theme', 'light');
        themeToggle.innerHTML = '<i data-lucide="moon"></i>';
    } else {
        // ダークテーマへ切り替え
        body.classList.add('theme-dark');
        localStorage.setItem('theme', 'dark');
        themeToggle.innerHTML = '<i data-lucide="sun"></i>';
    }

    // Lucideアイコンを再レンダリング
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// テーマを初期化し、イベントリスナーを設定
initTheme();
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
}
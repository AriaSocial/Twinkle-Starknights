window.onerror = function (message, source, lineno, colno, error) {
    alert("Global Error: " + message + "\nLine: " + lineno);
};

let canvas, context, gl, renderer, input, assetManager;
let skeleton, animationState, bounds;
let lastFrameTime = Date.now() / 1000;
let isPlaying = true;
let renderCount = 0;

// Helper to get WebGL clear color from CSS property
function getClearColorFromCss() {
    const viewport = document.querySelector('.viewport');
    if (!viewport) {
        return [0.94, 0.95, 0.96, 1.0];
    }

    const computedColor = window.getComputedStyle(viewport).backgroundColor;

    if (computedColor.startsWith('rgb')) {
        const matches = computedColor.match(/\d+(\.\d+)?/g);
        if (matches && matches.length >= 3) {
            const r = parseInt(matches[0]) / 255.0;
            const g = parseInt(matches[1]) / 255.0;
            const b = parseInt(matches[2]) / 255.0;
            const a = matches.length === 4 ? parseFloat(matches[3]) : 1.0;
            return [r, g, b, a];
        }
    }
    return [0.94, 0.95, 0.96, 1.0];
}

async function init() {
    console.log("Init started");
    canvas = document.getElementById("canvas");
    const controlPanelWidth = window.innerWidth > 768 ? 340 : 0;
    canvas.width = window.innerWidth - controlPanelWidth;
    canvas.height = window.innerHeight;

    const config = { alpha: true, preserveDrawingBuffer: true };
    gl = canvas.getContext("webgl", config) || canvas.getContext("experimental-webgl", config);
    if (!gl) {
        alert('WebGL is unavailable.');
        return;
    }
    console.log("WebGL context created");

    try {
        if (typeof spine === 'undefined') {
            throw new Error("Spine object is undefined. Script might not be loaded.");
        }
        console.log("Spine object found", spine);
        renderer = new spine.SceneRenderer(canvas, gl);
        console.log("SceneRenderer created");
    } catch (e) {
        alert("Error creating SceneRenderer: " + e.message);
        return;
    }

    window.addEventListener('resize', () => {
        const controlPanelWidth = window.innerWidth > 768 ? 340 : 0;
        canvas.width = window.innerWidth - controlPanelWidth;
        canvas.height = window.innerHeight;
        if (renderer) {
            renderer.resize(spine.ResizeMode.Expand);
            if (skeleton && bounds) {
                updateCamera();
            }
        }
    });

    document.getElementById('file-input').addEventListener('change', handleFileSelect);
    document.getElementById('play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('save-snapshot').addEventListener('click', saveSnapshot);
    document.getElementById('animation-list').addEventListener('change', changeAnimation);
    document.getElementById('skin-list').addEventListener('change', changeSkin);

    console.log("Init finished, starting render loop");
    requestAnimationFrame(render);
}

// --- UI Initialization Logic (Independent of Spine init) ---
document.addEventListener('DOMContentLoaded', () => {
    const paddingSlider = document.getElementById('snapshot-padding-slider');
    const paddingInput = document.getElementById('snapshot-padding');

    // スライダーの背景（プログレスバー）を更新する関数
    const updateSliderStyle = () => {
        if (paddingSlider) {
            const min = parseFloat(paddingSlider.min) || 0;
            const max = parseFloat(paddingSlider.max) || 100;
            const val = parseFloat(paddingSlider.value) || 0;
            // 0%から100%の間のどこにいるかを計算
            const percentage = ((val - min) / (max - min)) * 100;
            // background-sizeの幅を更新 (WebKitブラウザ用)
            paddingSlider.style.backgroundSize = `${percentage}% 100%`;
        }
    };

    if (paddingSlider && paddingInput) {
        // 初期化
        updateSliderStyle();

        // スライダー操作時
        paddingSlider.addEventListener('input', () => {
            paddingInput.value = paddingSlider.value;
            updateSliderStyle();
        });

        // 数値入力時
        paddingInput.addEventListener('input', () => {
            const val = parseFloat(paddingInput.value);
            // スライダーに値を反映（最大値を超えてもスライダーは最大位置で止まる）
            if (!isNaN(val)) {
                paddingSlider.value = val;
                updateSliderStyle();
            }
        });
    }
});
// ---------------------------------------------------------

async function handleFileSelect(event) {
    console.log("File selected");
    const files = event.target.files;
    if (files.length === 0) return;

    let skelFile, atlasFile, pngFile;
    const fileMap = {};

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'skel' || ext === 'json') skelFile = file;
        else if (ext === 'atlas') atlasFile = file;
        else if (ext === 'png') pngFile = file;

        fileMap[file.name] = file;
    }

    if (!skelFile || !atlasFile || !pngFile) {
        alert("Please select .skel/.json, .atlas, and .png files.");
        return;
    }
    console.log("Files identified", skelFile.name, atlasFile.name, pngFile.name);

    assetManager = new spine.AssetManager(gl, (path) => {
        return path;
    });

    assetManager.loadTexture = function (path, success, error) {
        console.log("Loading texture", path);
        const file = fileMap[path] || pngFile;
        if (!file) {
            error(`Texture file not found: ${path}`);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                console.log("Image loaded", path);
                const texture = new spine.GLTexture(gl, img);
                texture.setFilters(spine.TextureFilter.Linear, spine.TextureFilter.Linear);
                success(texture);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const atlasText = await readFileAsText(atlasFile);
    console.log("Atlas text loaded");

    try {
        const atlas = new spine.TextureAtlas(atlasText);
        console.log("Atlas created");

        for (let page of atlas.pages) {
            const file = fileMap[page.name] || pngFile;
            if (file) {
                const dataUrl = await readFileAsDataURL(file);
                const img = new Image();
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.src = dataUrl;
                });
                console.log("Page texture loaded", page.name);
                const texture = new spine.GLTexture(gl, img);
                texture.setFilters(spine.TextureFilter.Linear, spine.TextureFilter.Linear);
                page.setTexture(texture);
            }
        }

        let skeletonData;
        if (skelFile.name.endsWith('.json')) {
            const jsonText = await readFileAsText(skelFile);
            const skeletonJson = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
            skeletonData = skeletonJson.readSkeletonData(jsonText);
        } else {
            const buffer = await readFileAsArrayBuffer(skelFile);
            const skeletonBinary = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
            skeletonData = skeletonBinary.readSkeletonData(new Uint8Array(buffer));
        }
        console.log("Skeleton data loaded");

        skeleton = new spine.Skeleton(skeletonData);
        skeleton.setToSetupPose();
        skeleton.updateWorldTransform();

        bounds = { offset: new spine.Vector2(), size: new spine.Vector2() };
        skeleton.getBounds(bounds.offset, bounds.size, []);

        animationState = new spine.AnimationState(new spine.AnimationStateData(skeleton.data));

        const animSelect = document.getElementById('animation-list');
        animSelect.innerHTML = '';
        skeleton.data.animations.forEach(anim => {
            const option = document.createElement('option');
            option.value = anim.name;
            option.textContent = anim.name;
            animSelect.appendChild(option);
        });

        const skinSelect = document.getElementById('skin-list');
        skinSelect.innerHTML = '';
        skeleton.data.skins.forEach(skin => {
            const option = document.createElement('option');
            option.value = skin.name;
            option.textContent = skin.name;
            skinSelect.appendChild(option);
        });

        if (skeleton.data.skins.length > 0) {
            let initialSkin = skeleton.data.skins.find(s => s.name !== 'default') || skeleton.data.skins[0];
            skeleton.setSkin(initialSkin);
            skeleton.setSlotsToSetupPose();
            skinSelect.value = initialSkin.name;
        }

        if (skeleton.data.animations.length > 0) {
            animationState.setAnimation(0, skeleton.data.animations[0].name, true);
            document.getElementById('animation-controls').style.display = 'block';
        }

        updateCamera();
        console.log("Camera set", renderer.camera.position, renderer.camera.zoom);

    } catch (e) {
        console.error(e);
        alert("Error loading Spine data: " + e.message);
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function changeAnimation() {
    const animName = document.getElementById('animation-list').value;
    if (skeleton && animName) {
        animationState.setAnimation(0, animName, true);
    }
}

function changeSkin() {
    const skinName = document.getElementById('skin-list').value;
    if (skeleton && skinName) {
        skeleton.setSkinByName(skinName);
        skeleton.setSlotsToSetupPose();
        animationState.apply(skeleton);
    }
}

function updateCamera() {
    if (!skeleton || !bounds || !renderer) return;

    renderer.camera.position.x = bounds.offset.x + bounds.size.x / 2;
    renderer.camera.position.y = bounds.offset.y + bounds.size.y / 2;

    const padding = 0.9;
    const canvasAspect = canvas.width / canvas.height;
    const boundsAspect = bounds.size.x / bounds.size.y;

    if (canvasAspect > boundsAspect) {
        renderer.camera.zoom = (bounds.size.y / canvas.height) / padding;
    } else {
        renderer.camera.zoom = (bounds.size.x / canvas.width) / padding;
    }
}

function togglePlayPause() {
    isPlaying = !isPlaying;
    const button = document.getElementById('play-pause');

    if (typeof lucide !== 'undefined') {
        const span = button.querySelector('span');
        if (span) {
            span.textContent = isPlaying ? "一時停止" : "再生";
        }

        const oldIcon = button.querySelector('svg, i');
        if (oldIcon) {
            oldIcon.remove();
        }

        const newIcon = document.createElement('i');
        newIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
        button.insertBefore(newIcon, button.firstChild);

        lucide.createIcons();
    } else {
        button.textContent = isPlaying ? "Pause" : "Play";
    }
}

// --- 形式選択 & 解像度対応スナップショット保存 ---
function saveSnapshot() {
    if (!canvas || !renderer || !skeleton) return;

    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    const originalIsPlaying = isPlaying;

    isPlaying = false;

    // --- 設定値の取得 ---
    const paddingInput = document.getElementById('snapshot-padding');
    const paddingPx = paddingInput ? parseInt(paddingInput.value, 10) : 50;

    const resolutionSelect = document.getElementById('snapshot-resolution');
    const targetLongSide = resolutionSelect ? parseInt(resolutionSelect.value, 10) : 4096;

    const formatSelect = document.getElementById('snapshot-format');
    const mimeType = formatSelect ? formatSelect.value : 'image/png';
    const extension = mimeType === 'image/webp' ? 'webp' : 'png';
    // --------------------

    if (animationState) {
        animationState.apply(skeleton);
        skeleton.updateWorldTransform();
    }
    const offset = new spine.Vector2();
    const size = new spine.Vector2();
    skeleton.getBounds(offset, size, []);

    const contentLongSide = Math.max(size.x, size.y);
    let scale = 1.0;
    if (contentLongSide > 0) {
        scale = targetLongSide / contentLongSide;
    }

    const targetWidth = Math.floor((size.x * scale) + (paddingPx * 2));
    const targetHeight = Math.floor((size.y * scale) + (paddingPx * 2));

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    gl.viewport(0, 0, targetWidth, targetHeight);

    if (renderer.camera) {
        renderer.camera.viewportWidth = targetWidth;
        renderer.camera.viewportHeight = targetHeight;

        renderer.camera.position.x = offset.x + size.x / 2;
        renderer.camera.position.y = offset.y + size.y / 2;

        renderer.camera.zoom = 1.0 / scale;
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    renderer.begin();
    const pma = document.getElementById('pma-checkbox') ? document.getElementById('pma-checkbox').checked : false;
    const debug = document.getElementById('debug-checkbox') ? document.getElementById('debug-checkbox').checked : false;

    renderer.drawSkeleton(skeleton, pma);
    if (debug) {
        renderer.drawSkeletonDebug(skeleton, pma);
    }
    renderer.end();

    try {
        const dataUrl = canvas.toDataURL(mimeType);
        const link = document.createElement('a');
        link.download = `spine_snapshot_${targetWidth}x${targetHeight}.${extension}`;
        link.href = dataUrl;
        link.click();
    } catch (e) {
        console.error("Snapshot failed:", e);
        alert("画像の保存に失敗しました。\n" + e.message);
    }

    canvas.width = originalWidth;
    canvas.height = originalHeight;

    renderer.resize(spine.ResizeMode.Expand);
    updateCamera();

    isPlaying = originalIsPlaying;
    if (!isPlaying) {
        requestAnimationFrame(render);
    }
}
// ----------------------------------

function render() {
    const now = Date.now() / 1000;
    const delta = now - lastFrameTime;
    lastFrameTime = now;

    if (renderCount++ % 600 === 0) {
        console.log("Render loop running", renderCount);
    }

    const [r, g, b, a] = getClearColorFromCss();
    gl.clearColor(r, g, b, a);

    gl.clear(gl.COLOR_BUFFER_BIT);

    if (skeleton && animationState) {
        if (isPlaying) {
            animationState.update(delta);
            animationState.apply(skeleton);
            skeleton.updateWorldTransform();
        }

        renderer.begin();

        const pma = document.getElementById('pma-checkbox') ? document.getElementById('pma-checkbox').checked : false;
        const debug = document.getElementById('debug-checkbox') ? document.getElementById('debug-checkbox').checked : false;

        renderer.drawSkeleton(skeleton, pma);

        if (debug) {
            renderer.drawSkeletonDebug(skeleton, pma);
        }

        renderer.end();
    }

    requestAnimationFrame(render);
}

init();

window.onerror = function (message, source, lineno, colno, error) {
    alert("Global Error: " + message + "\nLine: " + lineno);
};

let canvas, context, gl, renderer, input, assetManager;
let skeleton, animationState, bounds;
let lastFrameTime = Date.now() / 1000;
let isPlaying = true;
let renderCount = 0;

async function init() {
    console.log("Init started");
    canvas = document.getElementById("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const config = { alpha: false };
    gl = canvas.getContext("webgl", config) || canvas.getContext("experimental-webgl", config);
    if (!gl) {
        alert('WebGL is unavailable.');
        return;
    }
    console.log("WebGL context created");

    try {
        // Create a simple renderer
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

    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (renderer) renderer.resize(spine.ResizeMode.Expand);
    });

    document.getElementById('file-input').addEventListener('change', handleFileSelect);
    document.getElementById('play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('animation-list').addEventListener('change', changeAnimation);
    document.getElementById('skin-list').addEventListener('change', changeSkin);

    console.log("Init finished, starting render loop");
    requestAnimationFrame(render);
}

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

    // Create a custom asset manager that reads from File objects
    assetManager = new spine.AssetManager(gl, (path) => {
        return path; // We will handle loading manually
    });

    // Override loadTexture to read from the File object
    assetManager.loadTexture = function (path, success, error) {
        console.log("Loading texture", path);
        const file = fileMap[path] || pngFile; // Fallback to the found png if name doesn't match exactly
        if (!file) {
            error(`Texture file not found: ${path}`);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                console.log("Image loaded", path);
                // Create texture with mipmaps disabled (manually set filters)
                // Removed 3rd arg 'false' just in case it's not supported in 4.0
                const texture = new spine.GLTexture(gl, img);
                texture.setFilters(spine.TextureFilter.Linear, spine.TextureFilter.Linear);
                success(texture);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    // Load atlas
    const atlasText = await readFileAsText(atlasFile);
    console.log("Atlas text loaded");

    try {
        const atlas = new spine.TextureAtlas(atlasText);
        console.log("Atlas created");

        // Now we need to load the pages (textures) for the atlas
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
                // Disable mipmaps here too
                const texture = new spine.GLTexture(gl, img);
                texture.setFilters(spine.TextureFilter.Linear, spine.TextureFilter.Linear);
                page.setTexture(texture);
            }
        }

        // Load Skeleton
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

        // Populate animation list
        const animSelect = document.getElementById('animation-list');
        animSelect.innerHTML = '';
        skeleton.data.animations.forEach(anim => {
            const option = document.createElement('option');
            option.value = anim.name;
            option.textContent = anim.name;
            animSelect.appendChild(option);
        });

        // Populate skin list
        const skinSelect = document.getElementById('skin-list');
        skinSelect.innerHTML = '';
        skeleton.data.skins.forEach(skin => {
            const option = document.createElement('option');
            option.value = skin.name;
            option.textContent = skin.name;
            skinSelect.appendChild(option);
        });

        // Set initial skin
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

        // Debug: Log eye slots
        console.log("--- Debugging Eye Slots ---");
        skeleton.slots.forEach(slot => {
            if (slot.data.name.includes('eye')) {
                console.log(`Slot: ${slot.data.name}`);
                console.log(`  Attachment: ${slot.attachment ? slot.attachment.name : 'None'}`);
                console.log(`  Color: R${slot.color.r} G${slot.color.g} B${slot.color.b} A${slot.color.a}`);
                console.log(`  Bone: ${slot.bone.data.name} (WorldX: ${slot.bone.worldX}, WorldY: ${slot.bone.worldY})`);
            }
        });
        console.log("---------------------------");

        renderer.camera.position.x = bounds.offset.x + bounds.size.x / 2;
        renderer.camera.position.y = bounds.offset.y + bounds.size.y / 2;
        renderer.camera.zoom = 1; // Adjust based on size?

        // Auto zoom to fit
        const windowRatio = canvas.width / canvas.height;
        const boundsRatio = bounds.size.x / bounds.size.y;
        if (windowRatio > boundsRatio) {
            renderer.camera.zoom = bounds.size.y / (canvas.height * 0.9);
        } else {
            renderer.camera.zoom = bounds.size.x / (canvas.width * 0.9);
        }
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

function togglePlayPause() {
    isPlaying = !isPlaying;
    document.getElementById('play-pause').textContent = isPlaying ? "Pause" : "Play";
}

function render() {
    const now = Date.now() / 1000;
    const delta = now - lastFrameTime;
    lastFrameTime = now;

    if (renderCount++ % 600 === 0) {
        console.log("Render loop running", renderCount);
    }

    gl.clearColor(0.2, 0.2, 0.2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (skeleton && animationState) {
        if (isPlaying) {
            animationState.update(delta);
            animationState.apply(skeleton);
            skeleton.updateWorldTransform();
        }

        renderer.begin();

        const pma = document.getElementById('pma-checkbox') ? document.getElementById('pma-checkbox').checked : true;
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

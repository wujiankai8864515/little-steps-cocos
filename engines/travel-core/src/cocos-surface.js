// A separately rendered 2D world. Presentation opacity belongs to the display
// sprite; it must not also fade the offscreen world and multiply alpha twice.
const surfaceHostLayers = new WeakMap();
function registerRenderSurface(cc) {
    const {Node, UITransform, Canvas, Camera, Color, Sprite, SpriteFrame, RenderTexture, director, Director} = cc;
    function estimateTarget(width, height) {
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('Invalid render target size');
        // Color RGBA8 plus a conservative four-byte depth/stencil attachment.
        return width * height * 8;
    }
    function createTarget(width, height, name) {
        estimateTarget(width, height);
        const texture = new RenderTexture();
        try {
            texture.initialize({width, height, name});
            texture.setFilters(RenderTexture.Filter.LINEAR, RenderTexture.Filter.LINEAR);
            texture.setMipFilter(RenderTexture.Filter.NONE);
            texture.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
            return texture;
        } catch (error) { texture.destroy(); throw error; }
    }
    function create({host, displayParent, logicalSize, displayRect, target, layer, name = 'WorldSurface'}, scope) {
        if (!scope.active) throw new CancelledError();
        if (!host || !displayParent) throw new Error('Surface requires scene/display hosts');
        let claimed = surfaceHostLayers.get(host);
        if (!claimed) {claimed = new Set(); surfaceHostLayers.set(host, claimed);}
        if (layer === undefined) {
            for (let bit = 19; bit >= 0; bit--) if (!claimed.has(1 << bit)) {layer = 1 << bit; break;}
        }
        if (!(layer > 0 && layer <= (1 << 19)) || (layer & (layer - 1)) || claimed.has(layer)) throw new Error('Surface requires an available user layer');
        claimed.add(layer);
        scope.own(() => claimed.delete(layer));
        const canvasNode = new Node(name), cameraNode = new Node(name + 'Camera'), content = new Node(name + 'Content'), display = new Node(name + 'Image');
        canvasNode.active = false; host.addChild(canvasNode);
        canvasNode.addChild(cameraNode); canvasNode.addChild(content); displayParent.addChild(display);
        const canvasUI = canvasNode.addComponent(UITransform), contentUI = content.addComponent(UITransform), displayUI = display.addComponent(UITransform);
        canvasUI.setAnchorPoint(.5, .5); contentUI.setAnchorPoint(0, 1); displayUI.setAnchorPoint(0, 1);
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO; camera.visibility = layer;
        camera.priority = -1; camera.near = 1; camera.far = 2000;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 0);
        cameraNode.setPosition(0, 0, 1000);
        const canvas = canvasNode.addComponent(Canvas); canvas.alignCanvasWithScreen = false; canvas.cameraComponent = camera;
        const sprite = display.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        display.layer = displayParent.layer;
        let frame = null, disposed = false, readyFrames = 0, settleReady;
        const ready = new Promise((resolve, reject) => {settleReady = error => error ? reject(error) : resolve();});
        // Consumers may dispose a prepared surface without adopting it. Keep
        // cancellation handled even if that consumer never awaits readiness.
        ready.catch(() => {});
        const afterDraw = () => {
            if (!canvasNode.active || !camera.enabledInHierarchy || disposed) return;
            if (++readyFrames < 2) return;
            director.off(Director.EVENT_AFTER_DRAW, afterDraw); settleReady();
        };
        director.on(Director.EVENT_AFTER_DRAW, afterDraw);
        const watched = new Map();
        function exclude(node) {
            const record = watched.get(node); if (!record) return;
            node.off(Node.EventType.CHILD_ADDED, record.added); node.off(Node.EventType.CHILD_REMOVED, record.removed);
            watched.delete(node); node.layer = record.previousLayer; node.children.forEach(exclude);
        }
        function include(node) {
            if (watched.has(node)) return;
            const previousLayer = node.layer;
            node.layer = layer;
            const added = child => include(child), removed = child => exclude(child);
            watched.set(node, {added, removed, previousLayer});
            node.on(Node.EventType.CHILD_ADDED, added); node.on(Node.EventType.CHILD_REMOVED, removed);
            node.children.forEach(include);
        }
        include(canvasNode);
        function layout(size, rect, texture) {
            if (disposed || !scope.active) return false;
            if (!size.every(value => Number.isFinite(value) && value > 0) || !rect.every(Number.isFinite)) throw new Error('Invalid surface layout');
            canvasUI.setContentSize(size[0], size[1]); contentUI.setContentSize(size[0], size[1]);
            content.setPosition(-size[0] / 2, size[1] / 2);
            display.setPosition(rect[0], -rect[1]); displayUI.setContentSize(rect[2], rect[3]);
            camera.orthoHeight = size[1] / 2;
            // RenderTexture.reset destroys the window attachments AND clears
            // its cameras. The Camera setter skips identical targets, so detach
            // before reattaching after an in-place reset (including rollback).
            if (camera.targetTexture === texture) camera.targetTexture = null;
            camera.targetTexture = texture;
            if (!frame || frame.texture !== texture || frame.originalSize?.width !== texture.width || frame.originalSize?.height !== texture.height) {
                const old = frame; frame = new SpriteFrame(); frame.texture = texture; frame.packable = false;
                // Builtin Sprite's SAMPLE_FROM_RT handles the graphics backend's
                // render-texture orientation. Never apply another manual flip.
                sprite.spriteFrame = frame; if (old) old.destroy();
            }
            return true;
        }
        function dispose() {
            if (disposed) return; disposed = true;
            director.off(Director.EVENT_AFTER_DRAW, afterDraw);
            if (readyFrames < 2) settleReady(new CancelledError());
            canvasNode.active = false; camera.enabled = false; camera.targetTexture = null;
            exclude(canvasNode); sprite.spriteFrame = null;
            if (frame) frame.destroy(); frame = null;
            display.destroy(); canvasNode.destroy();
        }
        scope.own(dispose);
        layout(logicalSize, displayRect, target); canvasNode.active = true;
        return {content, display, camera, layout, dispose, ready,
            setActive(value) {if (!disposed) canvasNode.active = !!value;},
            snapshot() {return {logicalSize:[canvasUI.width,canvasUI.height],pixels:camera.targetTexture?[camera.targetTexture.width,camera.targetTexture.height]:null,layer,priority:camera.priority,active:canvasNode.active,disposed,cameraEnabled:camera.enabledInHierarchy,cameraPosition:camera.node.worldPosition,contentPosition:content.worldPosition,displayPosition:display.worldPosition,trackedNodes:watched.size,readyFrames};},
        };
    }
    return {estimateTarget, createTarget, create};
}
Object.assign(api, {registerRenderSurface});

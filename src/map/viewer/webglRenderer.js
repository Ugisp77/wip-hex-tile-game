"use strict";

export class WebGLTileRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl2", {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
            preserveDrawingBuffer: false
        });

        if (!this.gl) {
            throw new Error("WebGL2 not supported");
        }

        this.program = null;
        this.buffers = {};
        this.attributes = {};
        this.uniforms = {};
        this.instanceData = null;
        this.tileCount = 0;
        this.viewMatrix = new Float32Array(9);
    }

    async init(vertShaderSrc, fragShaderSrc) {
        const gl = this.gl;

        // Compile shaders
        const vertShader = this.compileShader(gl.VERTEX_SHADER, vertShaderSrc);
        const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragShaderSrc);

        // Link program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertShader);
        gl.attachShader(this.program, fragShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(this.program);
            throw new Error("Failed to link program: " + info);
        }

        // Get locations
        this.attributes = {
            position: gl.getAttribLocation(this.program, "a_position"),
            texCoord: gl.getAttribLocation(this.program, "a_texCoord"),
            tilePos: gl.getAttribLocation(this.program, "a_tilePos"),
            tileSize: gl.getAttribLocation(this.program, "a_tileSize"),
            lift: gl.getAttribLocation(this.program, "a_lift"),
            glow: gl.getAttribLocation(this.program, "a_glow"),
            bright: gl.getAttribLocation(this.program, "a_bright"),
            texIndex: gl.getAttribLocation(this.program, "a_texIndex"),
            color: gl.getAttribLocation(this.program, "a_color")
        };

        this.uniforms = {
            matrix: gl.getUniformLocation(this.program, "u_matrix"),
            texture: gl.getUniformLocation(this.program, "u_texture"),
            atlasSize: gl.getUniformLocation(this.program, "u_atlasSize"),
            tileTexSize: gl.getUniformLocation(this.program, "u_tileTexSize"),
            glowColor: gl.getUniformLocation(this.program, "u_glowColor"),
            tintColor: gl.getUniformLocation(this.program, "u_tintColor"),
            tintStrength: gl.getUniformLocation(this.program, "u_tintStrength"),
            useFlatColor: gl.getUniformLocation(this.program, "u_useFlatColor")
        };

        // Create buffers
        this.buffers.position = gl.createBuffer();
        this.buffers.texCoord = gl.createBuffer();
        this.buffers.instance = gl.createBuffer();

        // Constant geometry
        const positions = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        // Setup VAO
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.enableVertexAttribArray(this.attributes.position);
        gl.vertexAttribPointer(this.attributes.position, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
        gl.enableVertexAttribArray(this.attributes.texCoord);
        gl.vertexAttribPointer(this.attributes.texCoord, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.instance);

        const stride = 11 * 4; // 11 floats
        gl.enableVertexAttribArray(this.attributes.tilePos);
        gl.vertexAttribPointer(this.attributes.tilePos, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(this.attributes.tilePos, 1);

        gl.enableVertexAttribArray(this.attributes.tileSize);
        gl.vertexAttribPointer(this.attributes.tileSize, 2, gl.FLOAT, false, stride, 8);
        gl.vertexAttribDivisor(this.attributes.tileSize, 1);

        gl.enableVertexAttribArray(this.attributes.lift);
        gl.vertexAttribPointer(this.attributes.lift, 1, gl.FLOAT, false, stride, 16);
        gl.vertexAttribDivisor(this.attributes.lift, 1);

        gl.enableVertexAttribArray(this.attributes.glow);
        gl.vertexAttribPointer(this.attributes.glow, 1, gl.FLOAT, false, stride, 20);
        gl.vertexAttribDivisor(this.attributes.glow, 1);

        gl.enableVertexAttribArray(this.attributes.bright);
        gl.vertexAttribPointer(this.attributes.bright, 1, gl.FLOAT, false, stride, 24);
        gl.vertexAttribDivisor(this.attributes.bright, 1);

        gl.enableVertexAttribArray(this.attributes.texIndex);
        gl.vertexAttribPointer(this.attributes.texIndex, 1, gl.FLOAT, false, stride, 28);
        gl.vertexAttribDivisor(this.attributes.texIndex, 1);

        gl.enableVertexAttribArray(this.attributes.color);
        gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, stride, 32);
        gl.vertexAttribDivisor(this.attributes.color, 1);

        gl.bindVertexArray(null);
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error("Shader compile error: " + info);
        }
        return shader;
    }

    createAtlas(images, tileWidth, tileHeight) {
        const gl = this.gl;
        const tilesPerRow = Math.ceil(Math.sqrt(images.length));
        const atlasWidth = tilesPerRow * tileWidth;
        const atlasHeight = Math.ceil(images.length / tilesPerRow) * tileHeight;

        const canvas = document.createElement("canvas");
        canvas.width = atlasWidth;
        canvas.height = atlasHeight;
        const ctx = canvas.getContext("2d");

        images.forEach((img, i) => {
            const x = (i % tilesPerRow) * tileWidth;
            const y = Math.floor(i / tilesPerRow) * tileHeight;
            ctx.drawImage(img, x, y, tileWidth, tileHeight);
        });

        this.atlas = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.atlas);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

        // Mipmapping for performance at low zoom
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        return { width: atlasWidth, height: atlasHeight, tileWidth, tileHeight };
    }

    updateInstanceData(tiles) {
        const gl = this.gl;
        const floatsPerTile = 11; // baseX, baseY, width, height, lift, glow, bright, texIndex, r, g, b
        if (!this.instanceData || this.instanceData.length !== tiles.length * floatsPerTile) {
            this.instanceData = new Float32Array(tiles.length * floatsPerTile);
        }

        for (let i = 0; i < tiles.length; i++) {
            this.writeTileData(i, tiles[i]);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.instance);
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);
        this.tileCount = tiles.length;
    }

    writeTileData(index, tile) {
        if (!this.instanceData) return;
        const floatsPerTile = 11;
        const offset = index * floatsPerTile;
        const data = this.instanceData;
        data[offset + 0] = tile.baseX;
        data[offset + 1] = tile.baseY + tile.dy;
        data[offset + 2] = tile.width;
        data[offset + 3] = tile.height;
        data[offset + 4] = tile.lift;
        data[offset + 5] = tile.glow;
        data[offset + 6] = tile.bright;
        data[offset + 7] = tile.atlasIndex || 0;

        const col = tile.rgbColor || [1, 1, 1];
        data[offset + 8] = col[0] / 255;
        data[offset + 9] = col[1] / 255;
        data[offset + 10] = col[2] / 255;
    }

    updateInstanceRange(startIndex, count) {
        if (!this.buffers.instance || !this.instanceData || count <= 0) return;
        const floatsPerTile = 11;
        const offsetInFloats = startIndex * floatsPerTile;
        const subData = this.instanceData.subarray(offsetInFloats, offsetInFloats + count * floatsPerTile);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.instance);
        this.gl.bufferSubData(this.gl.ARRAY_BUFFER, offsetInFloats * 4, subData);
    }

    render(camera, tintColor, tintStrength, glowColor, atlasInfo, useFlatColor = 0) {
        if (!this.program || !this.atlas || this.tileCount === 0) return;
        const gl = this.gl;

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Matrix optimization: avoid allocations
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const s = camera.scale;
        const m = this.viewMatrix;
        m[0] = 2 / (w / dpr) * s; m[1] = 0; m[2] = 0;
        m[3] = 0; m[4] = -2 / (h / dpr) * s; m[5] = 0;
        m[6] = (camera.x * dpr) * 2 / w - 1; m[7] = -(camera.y * dpr) * 2 / h + 1; m[8] = 1;

        gl.uniformMatrix3fv(this.uniforms.matrix, false, m);
        gl.uniform2f(this.uniforms.atlasSize, atlasInfo.width, atlasInfo.height);
        gl.uniform2f(this.uniforms.tileTexSize, atlasInfo.tileWidth, atlasInfo.tileHeight);
        gl.uniform3fv(this.uniforms.glowColor, glowColor);
        gl.uniform3fv(this.uniforms.tintColor, tintColor);
        gl.uniform1f(this.uniforms.tintStrength, tintStrength);
        gl.uniform1f(this.uniforms.useFlatColor, useFlatColor);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlas);
        gl.uniform1i(this.uniforms.texture, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.tileCount);

        gl.bindVertexArray(null);
    }

    resize(width, height) {
        if (this.canvas.width === width && this.canvas.height === height) return;
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
    }

    destroy() {
        const gl = this.gl;
        if (this.program) gl.deleteProgram(this.program);
        if (this.vao) gl.deleteVertexArray(this.vao);
        if (this.atlas) gl.deleteTexture(this.atlas);
        for (const buf of Object.values(this.buffers)) {
            if (buf) gl.deleteBuffer(buf);
        }
    }
}

"use strict";

export class WebGLNumberRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl2", {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false
        });

        if (!this.gl) {
            throw new Error("WebGL2 not supported");
        }

        this.program = null;
        this.buffers = {};
        this.attributes = {};
        this.uniforms = {};
        this.instanceData = null;
        this.instanceCount = 0;
        this.viewMatrix = new Float32Array(9);
    }

    async init(vertShaderSrc, fragShaderSrc) {
        const gl = this.gl;

        const vertShader = this.compileShader(gl.VERTEX_SHADER, vertShaderSrc);
        const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragShaderSrc);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vertShader);
        gl.attachShader(this.program, fragShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error("Failed to link number program: " + gl.getProgramInfoLog(this.program));
        }

        this.attributes = {
            position: gl.getAttribLocation(this.program, "a_position"),
            texCoord: gl.getAttribLocation(this.program, "a_texCoord"),
            tilePos: gl.getAttribLocation(this.program, "a_tilePos"),
            tileSize: gl.getAttribLocation(this.program, "a_tileSize"),
            texIndex: gl.getAttribLocation(this.program, "a_texIndex"),
            tintColor: gl.getAttribLocation(this.program, "a_tintColor")
        };

        this.uniforms = {
            matrix: gl.getUniformLocation(this.program, "u_matrix"),
            texture: gl.getUniformLocation(this.program, "u_texture"),
            atlasSize: gl.getUniformLocation(this.program, "u_atlasSize"),
            tileTexSize: gl.getUniformLocation(this.program, "u_tileTexSize"),
            mouseWorld: gl.getUniformLocation(this.program, "u_mouseWorld"),
            fadeInner: gl.getUniformLocation(this.program, "u_fadeInner"),
            fadeOuter: gl.getUniformLocation(this.program, "u_fadeOuter")
        };

        this.buffers.position = gl.createBuffer();
        this.buffers.texCoord = gl.createBuffer();
        this.buffers.instance = gl.createBuffer();

        const positions = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.enableVertexAttribArray(this.attributes.position);
        gl.vertexAttribPointer(this.attributes.position, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
        gl.enableVertexAttribArray(this.attributes.texCoord);
        gl.vertexAttribPointer(this.attributes.texCoord, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.instance);

        const stride = 8 * 4; // x,y, w,h, index, r,g,b
        gl.enableVertexAttribArray(this.attributes.tilePos);
        gl.vertexAttribPointer(this.attributes.tilePos, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(this.attributes.tilePos, 1);

        gl.enableVertexAttribArray(this.attributes.tileSize);
        gl.vertexAttribPointer(this.attributes.tileSize, 2, gl.FLOAT, false, stride, 8);
        gl.vertexAttribDivisor(this.attributes.tileSize, 1);

        gl.enableVertexAttribArray(this.attributes.texIndex);
        gl.vertexAttribPointer(this.attributes.texIndex, 1, gl.FLOAT, false, stride, 16);
        gl.vertexAttribDivisor(this.attributes.texIndex, 1);

        gl.enableVertexAttribArray(this.attributes.tintColor);
        gl.vertexAttribPointer(this.attributes.tintColor, 3, gl.FLOAT, false, stride, 20);
        gl.vertexAttribDivisor(this.attributes.tintColor, 1);

        gl.bindVertexArray(null);
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error("Number Shader error: " + gl.getShaderInfoLog(shader));
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

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        return { texture, width: atlasWidth, height: atlasHeight, tileWidth, tileHeight };
    }

    updateInstanceData(data, count) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.instance);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        this.instanceCount = count;
    }

    render(camera, mouseWorld, fadeInner, fadeOuter, atlasInfo) {
        if (!this.program || !this.instanceCount || !atlasInfo) return;
        const gl = this.gl;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const s = camera.scale;
        const m = this.viewMatrix;

        // Correct orthographic projection for world coords to clip space
        m[0] = 2 / (w / dpr) * s; m[1] = 0; m[2] = 0;
        m[3] = 0; m[4] = -2 / (h / dpr) * s; m[5] = 0;
        m[6] = (camera.x * dpr) * 2 / w - 1; m[7] = -(camera.y * dpr) * 2 / h + 1; m[8] = 1;

        gl.uniformMatrix3fv(this.uniforms.matrix, false, m);
        gl.uniform2f(this.uniforms.mouseWorld, mouseWorld.x, mouseWorld.y);
        gl.uniform1f(this.uniforms.fadeInner, fadeInner);
        gl.uniform1f(this.uniforms.fadeOuter, fadeOuter);
        gl.uniform2f(this.uniforms.atlasSize, atlasInfo.width, atlasInfo.height);
        gl.uniform2f(this.uniforms.tileTexSize, atlasInfo.tileWidth, atlasInfo.tileHeight);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlasInfo.texture);
        gl.uniform1i(this.uniforms.texture, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
        gl.bindVertexArray(null);
    }
}

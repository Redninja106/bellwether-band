"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./WebGLBackground.module.css";
import {
  generateVoronoiEdges,
  type CurvedEdge,
  type Point,
} from "./voronoi";

const SOURCE_WIDTH = 5127;
const SOURCE_HEIGHT = 3418;
const DESIGN_WIDTH = 1500;
const DESIGN_HEIGHT = 1000;
const CURVE_SAMPLES = 12;
const EDGE_SOFTNESS = 2;
const RAIL_THICKNESS = 2.5;
const COLOR_GRAIN = 0.259;
const MASK_GRAIN = 0.037;
const LATTICE_OPACITY = 0.3;
const WIND_STRENGTH = 20;
const WIND_SPEED = 0.65;
const MAX_DPR = 1.5;

const ASSETS = {
  background: "/scene/background.webp",
  ground: "/scene/ground.webp",
  tree: "/scene/tree.webp",
  sun: "/scene/sun.webp",
} as const;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SceneTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  portraitBlend: number;
};

type GLResources = {
  textureProgram: WebGLProgram;
  latticeProgram: WebGLProgram;
  textureBuffer: WebGLBuffer;
  latticeBuffer: WebGLBuffer;
  textures: Record<keyof typeof ASSETS, WebGLTexture>;
};

const TEXTURE_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform vec2 u_viewport;
out vec2 v_uv;

void main() {
  vec2 clip = (a_position / u_viewport) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const TEXTURE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv);
}`;

const LATTICE_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in float a_distance;
in float a_railHalfWidth;
uniform vec2 u_viewport;
out float v_distance;
out float v_railHalfWidth;

void main() {
  vec2 clip = (a_position / u_viewport) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_distance = a_distance;
  v_railHalfWidth = a_railHalfWidth;
}`;

const LATTICE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float v_distance;
in float v_railHalfWidth;
uniform float u_dpr;
out vec4 outColor;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  float bottomLeft = hash(cell);
  float bottomRight = hash(cell + vec2(1.0, 0.0));
  float topLeft = hash(cell + vec2(0.0, 1.0));
  float topRight = hash(cell + vec2(1.0));
  return mix(
    mix(bottomLeft, bottomRight, fraction.x),
    mix(topLeft, topRight, fraction.x),
    fraction.y
  );
}

void main() {
  vec2 pixel = gl_FragCoord.xy / u_dpr;
  float edgeDistance = abs(v_distance) - v_railHalfWidth;
  float coverage = 1.0 - smoothstep(-${EDGE_SOFTNESS.toFixed(1)}, ${EDGE_SOFTNESS.toFixed(1)}, edgeDistance);

  float broadGrain = valueNoise(pixel * 0.075);
  float fineGrain = valueNoise(pixel * 0.38 + vec2(19.3, 47.1));
  float pigmentNoise = broadGrain * 0.42 + fineGrain * 0.58;
  float pigmentBrightness = 1.0 + (pigmentNoise - 0.5) * ${COLOR_GRAIN.toFixed(3)} * 1.65;
  vec3 pigmentColor = vec3(148.0, 92.0, 41.0) / 255.0;
  pigmentColor *= pigmentBrightness * 0.92;

  float maskNoise = valueNoise(pixel * 0.57 + vec2(73.7, 11.9));
  float poreNoise = hash(pixel * 1.91);
  float clusteredMist = smoothstep(0.16, 0.84, maskNoise);
  float paintMask = poreNoise;
  paintMask *= 1.0 - ${MASK_GRAIN.toFixed(3)} * 0.22 * (1.0 - clusteredMist);
  float alpha = coverage * paintMask * ${LATTICE_OPACITY.toFixed(3)};

  outColor = vec4(pigmentColor, alpha);
}`;

function smoothstep(minimum: number, maximum: number, value: number) {
  const amount = Math.min(
    Math.max((value - minimum) / (maximum - minimum), 0),
    1,
  );
  return amount * amount * (3 - 2 * amount);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function sceneTransform(
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
): SceneTransform {
  const aspect = width / Math.max(height, 1);
  const portraitBlend = 1 - smoothstep(0.84, 1.16, aspect);
  const containedScale = Math.min(width / sourceWidth, height / sourceHeight);
  const portraitScale = height / sourceHeight;
  const scale = lerp(containedScale, portraitScale, portraitBlend);

  return {
    scale,
    offsetX: (width - sourceWidth * scale) * 0.5,
    offsetY: (height - sourceHeight * scale) * 0.5,
    portraitBlend,
  };
}

function layerRect(
  transform: SceneTransform,
  x: number,
  y: number,
  width: number,
  height: number,
): Rect {
  return {
    x: transform.offsetX + x * transform.scale,
    y: transform.offsetY + y * transform.scale,
    width: width * transform.scale,
    height: height * transform.scale,
  };
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown linking error.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${source}.`));
    image.src = source;
  });
}

function createTexture(gl: WebGL2RenderingContext, image: HTMLImageElement) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create WebGL texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    image,
  );
  return texture;
}

function cubicPoint(
  start: Point,
  controlA: Point,
  controlB: Point,
  end: Point,
  amount: number,
): Point {
  const inverse = 1 - amount;
  const inverseSquared = inverse * inverse;
  const amountSquared = amount * amount;
  return {
    x:
      inverseSquared * inverse * start.x +
      3 * inverseSquared * amount * controlA.x +
      3 * inverse * amountSquared * controlB.x +
      amountSquared * amount * end.x,
    y:
      inverseSquared * inverse * start.y +
      3 * inverseSquared * amount * controlA.y +
      3 * inverse * amountSquared * controlB.y +
      amountSquared * amount * end.y,
  };
}

function warpPoint(point: Point, time: number): Point {
  const phase = time * WIND_SPEED + point.x * 0.0053 + point.y * 0.0037;
  const driftX = Math.sin(phase) + Math.sin(phase * 1.71 + 2.4) * 0.35;
  const driftY =
    Math.cos(phase * 0.83 + 0.7) + Math.sin(phase * 1.37) * 0.28;
  return {
    x: point.x + driftX * WIND_STRENGTH * 0.34,
    y: point.y + driftY * WIND_STRENGTH * 0.34,
  };
}

function transformedPoint(
  point: Point,
  transform: SceneTransform,
  shiftX: number,
  shiftY: number,
) {
  return {
    x: transform.offsetX + point.x * transform.scale + shiftX,
    y: transform.offsetY + point.y * transform.scale + shiftY,
  };
}

function appendRailSegment(
  output: number[],
  start: Point,
  end: Point,
  railOffset: number,
  railHalfWidth: number,
  halfWidth: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude < 0.001) return;
  const tangentX = dx / magnitude;
  const tangentY = dy / magnitude;
  const normalX = -tangentY;
  const normalY = tangentX;
  const centerStartX = start.x + normalX * railOffset;
  const centerStartY = start.y + normalY * railOffset;
  const centerEndX = end.x + normalX * railOffset;
  const centerEndY = end.y + normalY * railOffset;
  const extension = Math.min(halfWidth, magnitude * 0.25);
  const startX = centerStartX - tangentX * extension;
  const startY = centerStartY - tangentY * extension;
  const endX = centerEndX + tangentX * extension;
  const endY = centerEndY + tangentY * extension;

  const ax = startX + normalX * halfWidth;
  const ay = startY + normalY * halfWidth;
  const bx = startX - normalX * halfWidth;
  const by = startY - normalY * halfWidth;
  const cx = endX + normalX * halfWidth;
  const cy = endY + normalY * halfWidth;
  const dx2 = endX - normalX * halfWidth;
  const dy2 = endY - normalY * halfWidth;

  output.push(
    ax,
    ay,
    halfWidth,
    railHalfWidth,
    bx,
    by,
    -halfWidth,
    railHalfWidth,
    cx,
    cy,
    halfWidth,
    railHalfWidth,
    cx,
    cy,
    halfWidth,
    railHalfWidth,
    bx,
    by,
    -halfWidth,
    railHalfWidth,
    dx2,
    dy2,
    -halfWidth,
    railHalfWidth,
  );
}

function buildLatticeVertices(
  edges: CurvedEdge[],
  transform: SceneTransform,
  shiftX: number,
  shiftY: number,
  time: number,
) {
  const vertices: number[] = [];

  for (const edge of edges) {
    const start = warpPoint(
      transformedPoint(edge.start, transform, shiftX, shiftY),
      time,
    );
    const controlA = warpPoint(
      transformedPoint(edge.controlA, transform, shiftX, shiftY),
      time,
    );
    const controlB = warpPoint(
      transformedPoint(edge.controlB, transform, shiftX, shiftY),
      time,
    );
    const end = warpPoint(
      transformedPoint(edge.end, transform, shiftX, shiftY),
      time,
    );
    const railOffset = edge.thickness * transform.scale;
    const railHalfWidth = RAIL_THICKNESS * transform.scale * 0.72;
    const expandedHalfWidth = railHalfWidth + EDGE_SOFTNESS;
    let previous = start;

    for (let sample = 1; sample <= CURVE_SAMPLES; sample += 1) {
      const current = cubicPoint(
        start,
        controlA,
        controlB,
        end,
        sample / CURVE_SAMPLES,
      );
      appendRailSegment(
        vertices,
        previous,
        current,
        railOffset,
        railHalfWidth,
        expandedHalfWidth,
      );
      appendRailSegment(
        vertices,
        previous,
        current,
        -railOffset,
        railHalfWidth,
        expandedHalfWidth,
      );
      previous = current;
    }
  }

  return new Float32Array(vertices);
}

function drawTexture(
  gl: WebGL2RenderingContext,
  resources: GLResources,
  texture: WebGLTexture,
  rect: Rect,
  viewportWidth: number,
  viewportHeight: number,
) {
  const vertices = new Float32Array([
    rect.x,
    rect.y,
    0,
    0,
    rect.x,
    rect.y + rect.height,
    0,
    1,
    rect.x + rect.width,
    rect.y,
    1,
    0,
    rect.x + rect.width,
    rect.y,
    1,
    0,
    rect.x,
    rect.y + rect.height,
    0,
    1,
    rect.x + rect.width,
    rect.y + rect.height,
    1,
    1,
  ]);

  gl.useProgram(resources.textureProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.textureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

  const position = gl.getAttribLocation(resources.textureProgram, "a_position");
  const uv = gl.getAttribLocation(resources.textureProgram, "a_uv");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  gl.uniform2f(
    gl.getUniformLocation(resources.textureProgram, "u_viewport"),
    viewportWidth,
    viewportHeight,
  );
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(
    gl.getUniformLocation(resources.textureProgram, "u_texture"),
    0,
  );
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawLattice(
  gl: WebGL2RenderingContext,
  resources: GLResources,
  vertices: Float32Array,
  viewportWidth: number,
  viewportHeight: number,
  dpr: number,
) {
  gl.useProgram(resources.latticeProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.latticeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

  const position = gl.getAttribLocation(resources.latticeProgram, "a_position");
  const distance = gl.getAttribLocation(resources.latticeProgram, "a_distance");
  const railHalfWidth = gl.getAttribLocation(
    resources.latticeProgram,
    "a_railHalfWidth",
  );
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(distance);
  gl.vertexAttribPointer(distance, 1, gl.FLOAT, false, 16, 8);
  gl.enableVertexAttribArray(railHalfWidth);
  gl.vertexAttribPointer(railHalfWidth, 1, gl.FLOAT, false, 16, 12);
  gl.uniform2f(
    gl.getUniformLocation(resources.latticeProgram, "u_viewport"),
    viewportWidth,
    viewportHeight,
  );
  gl.uniform1f(
    gl.getUniformLocation(resources.latticeProgram, "u_dpr"),
    dpr,
  );
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
}

function destroyResources(gl: WebGL2RenderingContext, resources: GLResources) {
  gl.deleteProgram(resources.textureProgram);
  gl.deleteProgram(resources.latticeProgram);
  gl.deleteBuffer(resources.textureBuffer);
  gl.deleteBuffer(resources.latticeBuffer);
  for (const texture of Object.values(resources.textures)) {
    gl.deleteTexture(texture);
  }
}

export default function WebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let frame = 0;
    let resources: GLResources | null = null;
    let gl: WebGL2RenderingContext | null = null;
    let startedAt = performance.now();
    let elapsedBeforePause = 0;
    let pausedAt: number | null = null;
    const edges = generateVoronoiEdges();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const initialize = async () => {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        powerPreference: "high-performance",
      });
      if (!gl) return;

      try {
        const [background, ground, tree, sun] = await Promise.all([
          loadImage(ASSETS.background),
          loadImage(ASSETS.ground),
          loadImage(ASSETS.tree),
          loadImage(ASSETS.sun),
        ]);
        if (disposed || !gl) return;

        const textureProgram = createProgram(
          gl,
          TEXTURE_VERTEX_SHADER,
          TEXTURE_FRAGMENT_SHADER,
        );
        const latticeProgram = createProgram(
          gl,
          LATTICE_VERTEX_SHADER,
          LATTICE_FRAGMENT_SHADER,
        );
        const textureBuffer = gl.createBuffer();
        const latticeBuffer = gl.createBuffer();
        if (!textureBuffer || !latticeBuffer) {
          throw new Error("Unable to create WebGL buffers.");
        }

        resources = {
          textureProgram,
          latticeProgram,
          textureBuffer,
          latticeBuffer,
          textures: {
            background: createTexture(gl, background),
            ground: createTexture(gl, ground),
            tree: createTexture(gl, tree),
            sun: createTexture(gl, sun),
          },
        };

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        setReady(true);
        frame = requestAnimationFrame(render);
      } catch (error) {
        console.error("Unable to initialize the WebGL background.", error);
        setReady(false);
      }
    };

    const render = (timestamp: number) => {
      if (disposed || !gl || !resources) return;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const bufferWidth = Math.max(1, Math.round(width * dpr));
      const bufferHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
      }

      gl.viewport(0, 0, bufferWidth, bufferHeight);
      gl.clearColor(0.018, 0.07, 0.048, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const artwork = sceneTransform(
        width,
        height,
        SOURCE_WIDTH,
        SOURCE_HEIGHT,
      );
      const lattice = sceneTransform(
        width,
        height,
        DESIGN_WIDTH,
        DESIGN_HEIGHT,
      );
      const fullScene = layerRect(
        artwork,
        0,
        0,
        SOURCE_WIDTH,
        SOURCE_HEIGHT,
      );
      const regularSun = layerRect(artwork, 497.5, -58, 928, 815);
      const mobileSun = {
        x: width * 0.06,
        y: height * -0.02,
        width: 928 * artwork.scale,
        height: 815 * artwork.scale,
      };
      const sunRect = {
        x: lerp(regularSun.x, mobileSun.x, artwork.portraitBlend),
        y: lerp(regularSun.y, mobileSun.y, artwork.portraitBlend),
        width: lerp(regularSun.width, mobileSun.width, artwork.portraitBlend),
        height: lerp(
          regularSun.height,
          mobileSun.height,
          artwork.portraitBlend,
        ),
      };
      const latticeShiftX = sunRect.x - regularSun.x;
      const latticeShiftY = sunRect.y - regularSun.y;
      const time = reducedMotion.matches
        ? 0
        : (timestamp - startedAt - elapsedBeforePause) / 1000;

      const clipLeft = Math.max(0, Math.floor(fullScene.x * dpr));
      const clipBottom = Math.max(
        0,
        Math.floor((height - fullScene.y - fullScene.height) * dpr),
      );
      const clipRight = Math.min(
        bufferWidth,
        Math.ceil((fullScene.x + fullScene.width) * dpr),
      );
      const clipTop = Math.min(
        bufferHeight,
        Math.ceil((height - fullScene.y) * dpr),
      );
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        clipLeft,
        clipBottom,
        Math.max(0, clipRight - clipLeft),
        Math.max(0, clipTop - clipBottom),
      );

      drawTexture(
        gl,
        resources,
        resources.textures.background,
        fullScene,
        width,
        height,
      );
      drawLattice(
        gl,
        resources,
        buildLatticeVertices(
          edges,
          lattice,
          latticeShiftX,
          latticeShiftY,
          time,
        ),
        width,
        height,
        dpr,
      );
      drawTexture(
        gl,
        resources,
        resources.textures.ground,
        layerRect(artwork, 0, 2669, 5127, 749),
        width,
        height,
      );
      drawTexture(
        gl,
        resources,
        resources.textures.tree,
        layerRect(artwork, 2526, 558, 984, 2398),
        width,
        height,
      );
      drawTexture(
        gl,
        resources,
        resources.textures.sun,
        sunRect,
        width,
        height,
      );
      gl.disable(gl.SCISSOR_TEST);

      frame = requestAnimationFrame(render);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        pausedAt = performance.now();
      } else if (!frame && resources) {
        if (pausedAt !== null) elapsedBeforePause += performance.now() - pausedAt;
        pausedAt = null;
        frame = requestAnimationFrame(render);
      }
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      resources = null;
      setReady(false);
    };

    const onContextRestored = () => {
      startedAt = performance.now();
      elapsedBeforePause = 0;
      void initialize();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    void initialize();

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (gl && resources) destroyResources(gl, resources);
    };
  }, []);

  return (
    <div className={styles.scene} aria-hidden="true">
      <div
        className={`${styles.fallback} ${ready ? styles.fallbackHidden : ""}`}
      >
        <div className={styles.fallbackArtwork}>
          <img
            className={styles.fallbackBackground}
            src={ASSETS.background}
            alt=""
          />
          <img className={styles.fallbackGround} src={ASSETS.ground} alt="" />
          <img className={styles.fallbackTree} src={ASSETS.tree} alt="" />
          <img className={styles.fallbackSun} src={ASSETS.sun} alt="" />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${ready ? styles.ready : ""}`}
      />
    </div>
  );
}

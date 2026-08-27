"use client";

import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "../hooks/useMediaQuery";

const VERTEX_SHADER = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Particle field from the Stitch export (shader/code.html): 40 slow-rising
// particles tinting from warm white toward the indigo accent.
const FRAGMENT_SHADER = `precision highp float;
varying vec2 v_texCoord;
uniform float u_time;
uniform vec2 u_resolution;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 uv = v_texCoord;
    vec3 backgroundColor = vec3(0.98, 0.98, 0.976); // Soft warm white
    vec3 accentColor = vec3(0.365, 0.373, 0.937); // Warm Indigo #5D5FEF

    float particles = 0.0;
    for(float i = 0.0; i < 40.0; i++) {
        float t = u_time * (0.1 + random(vec2(i, 0.0)) * 0.2);
        vec2 pos = vec2(
            random(vec2(i, 1.0)),
            fract(random(vec2(i, 2.0)) + t)
        );

        float dist = distance(uv, pos);
        float size = 0.002 + random(vec2(i, 3.0)) * 0.004;
        particles += smoothstep(size, 0.0, dist) * (1.0 - pos.y);
    }

    vec3 finalColor = mix(backgroundColor, accentColor, particles * 0.15);
    gl_FragColor = vec4(finalColor, 1.0);
}`;

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Background wash rendered only behind the Dashboard hero band (~40vh).
 * Renders a WebGL particle field at 30% opacity with mix-blend-multiply and a
 * fade-to-surface gradient. Falls back to the static gradient alone when the
 * user prefers reduced motion, on mobile viewports, or if WebGL context
 * creation fails. This is the only 3D/shader element in the app.
 */
export default function DashboardShader() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [enabled, setEnabled] = useState(false);
	const isMobile = useIsMobile();

	useEffect(() => {
		if (isMobile || prefersReducedMotion()) {
			setEnabled(false);
			return;
		}

		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const handleMediaChange = () => {
			// Reduced motion can only disable the shader; it never re-enables it.
			if (media.matches) {
				setEnabled(false);
			}
		};
		media.addEventListener("change", handleMediaChange);

		const canvas = canvasRef.current;
		if (!canvas) {
			return () => media.removeEventListener("change", handleMediaChange);
		}

		const gl =
			(canvas.getContext("webgl") as WebGLRenderingContext | null) ||
			(canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
		if (!gl) {
			setEnabled(false);
			return () => media.removeEventListener("change", handleMediaChange);
		}

		setEnabled(true);

		const compileShader = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) return null;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			return shader;
		};

		const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
		const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
		const prog = gl.createProgram();
		if (!vs || !fs || !prog) {
			setEnabled(false);
			return () => media.removeEventListener("change", handleMediaChange);
		}
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			setEnabled(false);
			return () => media.removeEventListener("change", handleMediaChange);
		}
		gl.useProgram(prog);

		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
			gl.STATIC_DRAW,
		);
		const pos = gl.getAttribLocation(prog, "a_position");
		gl.enableVertexAttribArray(pos);
		gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
		const uTime = gl.getUniformLocation(prog, "u_time");
		const uRes = gl.getUniformLocation(prog, "u_resolution");

		const syncSize = () => {
			const w = canvas.clientWidth || 1280;
			const h = canvas.clientHeight || 720;
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
			}
		};
		syncSize();

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(syncSize);
			resizeObserver.observe(canvas);
		}

		let rafId = 0;
		let running = true;

		const render = (t: number) => {
			if (!running) return;
			if (typeof ResizeObserver === "undefined") syncSize();
			gl.viewport(0, 0, canvas.width, canvas.height);
			if (uTime) gl.uniform1f(uTime, t * 0.001);
			if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			rafId = requestAnimationFrame(render);
		};

		const handleVisibility = () => {
			if (document.hidden) {
				running = false;
				cancelAnimationFrame(rafId);
			} else if (!running) {
				running = true;
				rafId = requestAnimationFrame(render);
			}
		};
		document.addEventListener("visibilitychange", handleVisibility);

		rafId = requestAnimationFrame(render);

		return () => {
			running = false;
			cancelAnimationFrame(rafId);
			document.removeEventListener("visibilitychange", handleVisibility);
			resizeObserver?.disconnect();
			media.removeEventListener("change", handleMediaChange);
			gl.getExtension("WEBGL_lose_context")?.loseContext();
		};
	}, [isMobile]);

	return (
		<div
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				height: "40vh",
				overflow: "hidden",
				pointerEvents: "none",
				zIndex: 0,
			}}
			className={`${enabled ? "shader-band" : "shader-static-fallback"}`}
			aria-hidden="true"
		>
			{enabled ? <canvas ref={canvasRef} /> : null}
			<div className="shader-band-fade" />
		</div>
	);
}

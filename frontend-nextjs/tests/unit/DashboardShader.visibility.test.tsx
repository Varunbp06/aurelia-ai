import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardShader from "../../src/components/DashboardShader";

const intersectionCallbacks: IntersectionObserverCallback[] = [];

class MockIntersectionObserver {
	root: Element | Document | null = null;
	rootMargin = "0px";
	thresholds = [0];

	constructor(callback: IntersectionObserverCallback) {
		intersectionCallbacks.push(callback);
	}

	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
}

vi.mock("../../src/hooks/useMediaQuery", () => ({ useIsMobile: () => false }));

describe("DashboardShader visibility scheduling", () => {
	beforeEach(() => {
		intersectionCallbacks.length = 0;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("pauses frames offscreen and resumes when the shader returns to view", () => {
		let nextFrameId = 1;
		const requestFrame = vi.fn((_callback: FrameRequestCallback) => nextFrameId++);
		const cancelFrame = vi.fn();
		const gl = {
			VERTEX_SHADER: 0x8b31,
			FRAGMENT_SHADER: 0x8b30,
			ARRAY_BUFFER: 0x8892,
			STATIC_DRAW: 0x88e4,
			FLOAT: 0x1406,
			TRIANGLE_STRIP: 5,
			LINK_STATUS: 0x8b82,
			createShader: vi.fn(() => ({})),
			shaderSource: vi.fn(),
			compileShader: vi.fn(),
			createProgram: vi.fn(() => ({})),
			attachShader: vi.fn(),
			linkProgram: vi.fn(),
			getProgramParameter: vi.fn(() => true),
			useProgram: vi.fn(),
			createBuffer: vi.fn(() => ({})),
			bindBuffer: vi.fn(),
			bufferData: vi.fn(),
			getAttribLocation: vi.fn(() => 0),
			enableVertexAttribArray: vi.fn(),
			vertexAttribPointer: vi.fn(),
			getUniformLocation: vi.fn(() => ({})),
			viewport: vi.fn(),
			uniform1f: vi.fn(),
			uniform2f: vi.fn(),
			drawArrays: vi.fn(),
			getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
		};

		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
		vi.stubGlobal("requestAnimationFrame", requestFrame);
		vi.stubGlobal("cancelAnimationFrame", cancelFrame);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
			gl as unknown as WebGLRenderingContext,
		);

		render(<DashboardShader />);

		expect(requestFrame).toHaveBeenCalledTimes(1);
		act(() => {
			intersectionCallbacks[0](
				[{ isIntersecting: false } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
		});
		expect(cancelFrame).toHaveBeenCalledWith(1);
		expect(requestFrame).toHaveBeenCalledTimes(1);

		act(() => {
			intersectionCallbacks[0](
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
		});
		expect(requestFrame).toHaveBeenCalledTimes(2);
	});
});

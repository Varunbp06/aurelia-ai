// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAuth } from "../../src/components/RequireAuth";

type MockAdmin = { role: string } | null;
type AdminStatus = "pending" | "verified" | "failed";

const authState = vi.hoisted(() => ({
	token: String(1) as string | null,
	admin: null as MockAdmin,
	isLoading: false,
	adminStatus: "pending" as AdminStatus,
	revalidateCalls: 0,
}));

const navigateCalls = vi.hoisted((): string[] => []);

vi.mock("../../src/context/AuthContext", () => ({
	useAuth: () => ({
		token: authState.token,
		admin: authState.admin,
		isLoading: authState.isLoading,
		adminStatus: authState.adminStatus,
		revalidate: () => {
			authState.revalidateCalls += 1;
		},
	}),
}));

vi.mock("../../src/router/react-router-dom", async () => {
	const React = await import("react");
	return {
		Navigate: ({ to }: { to: string }) => {
			navigateCalls.push(to);
			return React.createElement("div", null, `navigate:${to}`);
		},
		useLocation: () => ({ pathname: "/", search: "" }),
	};
});

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
	navigateCalls.length = 0;
	authState.token = String(1);
	authState.admin = null;
	authState.isLoading = false;
	authState.adminStatus = "pending";
	authState.revalidateCalls = 0;
});

describe("RequireAuth admin verification", () => {
	it("does not redirect when a token exists while admin state is still hydrating", () => {
		render(
			<RequireAuth>
				<div>dashboard home</div>
			</RequireAuth>,
		);

		expect(screen.getByText("status.loading")).toBeInTheDocument();
		expect(screen.queryByText("navigate:/login")).not.toBeInTheDocument();
		expect(navigateCalls).toEqual([]);
	});

	// Regression: a cached "super_admin" must not unlock privileged UI before
	// the backend has confirmed the role. It previously rendered immediately.
	it("does not render privileged content for a cached super_admin before verification", () => {
		authState.admin = { role: "super_admin" };
		authState.adminStatus = "pending";

		render(
			<RequireAuth>
				<div>dashboard home</div>
			</RequireAuth>,
		);

		expect(screen.queryByText("dashboard home")).not.toBeInTheDocument();
		expect(screen.getByText("status.loading")).toBeInTheDocument();
	});

	// Regression: on a network failure the cached role used to be kept, which
	// let a demoted or deactivated admin keep privileged UI indefinitely.
	it("stays restricted and offers retry when verification fails", () => {
		authState.admin = { role: "super_admin" };
		authState.adminStatus = "failed";

		render(
			<RequireAuth>
				<div>dashboard home</div>
			</RequireAuth>,
		);

		expect(screen.queryByText("dashboard home")).not.toBeInTheDocument();
		expect(screen.getByRole("alert")).toBeInTheDocument();

		screen.getByText("retry").click();
		expect(authState.revalidateCalls).toBe(1);
	});

	it("renders dashboard content once the super admin role is verified", () => {
		authState.admin = { role: "super_admin" };
		authState.adminStatus = "verified";

		render(
			<RequireAuth>
				<div>dashboard home</div>
			</RequireAuth>,
		);

		expect(screen.getByText("dashboard home")).toBeInTheDocument();
		expect(navigateCalls).toEqual([]);
	});
});
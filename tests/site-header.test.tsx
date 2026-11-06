import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import SiteHeader from "@/components/SiteHeader";

const main = () => screen.getByRole("navigation", { name: "Main" });

afterEach(() => {
  cleanup();
  pathname = "/";
  document.cookie = "sb-test-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("SiteHeader", () => {
  it("shows a clear log in and sign up when signed out", () => {
    render(<SiteHeader />);
    const login = screen.getAllByRole("link", { name: "Log in" })[0];
    expect(login.getAttribute("href")).toBe("/login?next=%2Faccount");
    expect(screen.getByRole("link", { name: "Create free account" })).toBeTruthy();
  });

  it("switches to My Pikalo when a session cookie exists", () => {
    document.cookie = "sb-test-auth-token=x";
    render(<SiteHeader />);
    expect(
      screen.getAllByRole("link", { name: "My Pikalo" })[0].getAttribute("href"),
    ).toBe("/account");
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Create free account" })).toBeNull();
  });

  it("puts the calculators in a menu that opens, marks the page and closes on Escape", () => {
    pathname = "/roth";
    render(<SiteHeader />);
    const button = within(main()).getByRole("button", { name: /calculators/i });
    expect(within(main()).queryByRole("link", { name: /roth ira/i })).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const roth = within(main()).getByRole("link", { name: /roth ira/i });
    expect(roth.getAttribute("aria-current")).toBe("page");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("has a mobile menu with every page", () => {
    render(<SiteHeader />);
    const toggle = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(toggle);
    const mobile = screen.getByRole("navigation", { name: "Mobile" });
    for (const name of [
      /ask a tax question/i,
      /residency/i,
      /fica/i,
      /roth/i,
      /money traps/i,
    ]) {
      expect(within(mobile).getByRole("link", { name })).toBeTruthy();
    }
  });
});

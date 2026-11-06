import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let pathname = "/fica";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import AssistantDock from "@/components/AssistantDock";
import SiteNav from "@/components/SiteNav";

afterEach(() => {
  cleanup();
  pathname = "/fica";
});

describe("AssistantDock", () => {
  it("opens a labelled dialog and focuses the question box", () => {
    render(<AssistantDock />);
    const launcher = screen.getByRole("button", { name: /ask pikalo/i });
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(launcher);
    const dialog = screen.getByRole("dialog", { name: /ask pikalo/i });
    expect(dialog).toBeTruthy();
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Your question"));
  });

  it("closes on Escape and returns focus to the launcher", () => {
    render(<AssistantDock />);
    const launcher = screen.getByRole("button", { name: /ask pikalo/i });
    fireEvent.click(launcher);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(launcher);
  });

  it("keeps what you typed when closed and reopened", () => {
    render(<AssistantDock />);
    const launcher = screen.getByRole("button", { name: /ask pikalo/i });
    fireEvent.click(launcher);
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "FICA?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    fireEvent.click(launcher);
    expect((screen.getByLabelText("Your question") as HTMLTextAreaElement).value).toBe(
      "FICA?",
    );
  });

  it.each(["/ask", "/login", "/review"])("is hidden on %s", (p) => {
    pathname = p;
    render(<AssistantDock />);
    expect(screen.queryByRole("button", { name: /ask pikalo/i })).toBeNull();
  });
});

describe("SiteNav", () => {
  it("groups the calculators and marks the current page", () => {
    pathname = "/roth";
    render(<SiteNav />);
    expect(
      screen.getByRole("link", { name: "Roth IRA" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Ask" }).getAttribute("aria-current"),
    ).toBeNull();
    expect(screen.getByText("Calculators")).toBeTruthy();
  });
});

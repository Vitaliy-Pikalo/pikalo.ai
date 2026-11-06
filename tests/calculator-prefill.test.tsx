import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const saveFacts = vi.fn();
vi.mock("@/app/account/actions", () => ({
  saveFacts: (...a: unknown[]) => saveFacts(...a),
  deleteFacts: vi.fn(),
}));

import SaveBar from "@/components/SaveBar";
import ResidencyChecker from "@/components/ResidencyChecker";
import FicaChecker from "@/components/FicaChecker";
import RothCalculator from "@/components/RothCalculator";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SaveBar", () => {
  it("asks signed-out visitors to sign in and come back to this page", () => {
    render(<SaveBar signedIn={false} from="/fica" patch={{}} />);
    const link = screen.getByRole("link", { name: /sign in to save/i });
    expect(link.getAttribute("href")).toBe("/login?next=%2Ffica");
  });

  it("says when answers were filled in and links to edit them", () => {
    render(<SaveBar signedIn prefilled from="/fica" patch={{}} />);
    expect(screen.getByText(/filled in from your saved answers/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /my pikalo/i }).getAttribute("href")).toBe(
      "/account",
    );
  });

  it("saves the current answers", async () => {
    saveFacts.mockResolvedValue({ ok: true, facts: { wages: 100 } });
    render(<SaveBar signedIn from="/fica" patch={{ wages: 100 }} />);
    fireEvent.click(screen.getByRole("button", { name: /save to my pikalo/i }));
    await waitFor(() => expect(screen.getByText(/^saved/i)).toBeTruthy());
    expect(saveFacts).toHaveBeenCalledWith({ wages: 100 });
  });

  it("shows the server's error", async () => {
    saveFacts.mockResolvedValue({ ok: false, error: "Sign in to save your answers." });
    render(<SaveBar signedIn from="/roth" patch={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /save to my pikalo/i }));
    await waitFor(() =>
      expect(screen.getByText(/sign in to save your answers/i)).toBeTruthy(),
    );
  });

  it("renders nothing until it knows whether you're signed in", () => {
    const { container } = render(<SaveBar from="/roth" patch={{}} />);
    expect(container.textContent).toBe("");
  });
});

describe("calculator prefill", () => {
  it("fills the residency checker from saved answers", () => {
    render(
      <ResidencyChecker
        signedIn
        initial={{
          status_kind: "j1_scholar",
          first_year_in_status: 2023,
          days_by_year: { "2026": 200, "2025": 150 },
        }}
      />,
    );
    expect(screen.getByDisplayValue("200")).toBeTruthy();
    expect(screen.getByDisplayValue("150")).toBeTruthy();
    expect(screen.getByDisplayValue("2023")).toBeTruthy();
    expect(
      (
        screen.getByRole("radio", {
          name: /teacher|trainee|researcher/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("saves residency days for the right years", async () => {
    saveFacts.mockResolvedValue({ ok: true, facts: {} });
    render(<ResidencyChecker signedIn initial={{ days_by_year: { "2026": 200 } }} />);
    fireEvent.click(screen.getByRole("button", { name: /save to my pikalo/i }));
    await waitFor(() => expect(saveFacts).toHaveBeenCalled());
    expect(saveFacts.mock.calls[0][0].days_by_year).toEqual({ "2026": 200 });
  });

  it("fills the FICA checker and saves the W-2", async () => {
    saveFacts.mockResolvedValue({ ok: true, facts: {} });
    render(
      <FicaChecker
        signedIn
        initial={{
          status_kind: "f1",
          job: "cpt",
          first_year_in_status: 2024,
          wages: 12000,
          ss_withheld: 744,
          medicare_withheld: 174,
        }}
      />,
    );
    expect(screen.getByDisplayValue("12000")).toBeTruthy();
    expect(screen.getByDisplayValue("744")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /CPT/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: /save to my pikalo/i }));
    await waitFor(() => expect(saveFacts).toHaveBeenCalled());
    expect(saveFacts.mock.calls[0][0]).toMatchObject({
      status_kind: "f1",
      job: "cpt",
      wages: 12000,
      ss_withheld: 744,
      medicare_withheld: 174,
      w2_year: 2026,
    });
  });

  it("doesn't overwrite a saved green card with the FICA page's work-visa option", async () => {
    saveFacts.mockResolvedValue({ ok: true, facts: {} });
    render(<FicaChecker signedIn initial={{ status_kind: "green_card" }} />);
    fireEvent.click(screen.getByRole("button", { name: /save to my pikalo/i }));
    await waitFor(() => expect(saveFacts).toHaveBeenCalled());
    expect(saveFacts.mock.calls[0][0].status_kind).toBeUndefined();
  });

  it("fills the Roth calculator", () => {
    render(
      <RothCalculator
        signedIn
        initial={{ filing_status: "head_of_household", compensation: 52000 }}
      />,
    );
    expect(screen.getByDisplayValue("52000")).toBeTruthy();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "head_of_household",
    );
  });

  it("doesn't save empty fields as zeros", async () => {
    saveFacts.mockResolvedValue({ ok: true, facts: {} });
    render(<RothCalculator signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /save to my pikalo/i }));
    await waitFor(() => expect(saveFacts).toHaveBeenCalled());
    const patch = saveFacts.mock.calls[0][0];
    expect(patch.compensation).toBeUndefined();
    expect(patch.magi).toBeUndefined();
  });

  it("works with no saved answers (signed out)", () => {
    render(<FicaChecker />);
    expect(screen.queryByRole("button", { name: /save to my pikalo/i })).toBeNull();
  });
});

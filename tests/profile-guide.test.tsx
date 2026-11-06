import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const saveFacts = vi.fn();
const deleteFacts = vi.fn();
vi.mock("@/app/account/actions", () => ({
  saveFacts: (...a: unknown[]) => saveFacts(...a),
  deleteFacts: (...a: unknown[]) => deleteFacts(...a),
}));

import ProfileGuide from "@/components/ProfileGuide";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const card = (name: RegExp) => screen.getByRole("region", { name });

describe("ProfileGuide", () => {
  it("shows each tool's status and what it still needs", () => {
    render(<ProfileGuide initialFacts={{ status_kind: "f1" }} taxYear={2026} />);
    const res = card(/residency/i);
    expect(within(res).getByText(/Days in the U.S. in 2026/)).toBeTruthy();
    expect(within(res).getByText(/needs/i)).toBeTruthy();
  });

  it("explains why each step is asked and which tools use it", () => {
    render(<ProfileGuide initialFacts={{}} taxYear={2026} />);
    expect(screen.getAllByText(/Used by/i).length).toBeGreaterThanOrEqual(3);
  });

  it("saves a step and updates readiness from what the server returns", async () => {
    saveFacts.mockResolvedValue({
      ok: true,
      facts: {
        status_kind: "f1",
        first_year_in_status: 2024,
        days_by_year: { "2026": 300, "2025": 330, "2024": 120 },
      },
    });
    render(
      <ProfileGuide
        initialFacts={{ status_kind: "f1", first_year_in_status: 2024 }}
        taxYear={2026}
      />,
    );
    const step = screen.getByRole("form", { name: /days in the u\.s\./i });
    fireEvent.change(within(step).getByLabelText("2026"), { target: { value: "300" } });
    fireEvent.change(within(step).getByLabelText("2025"), { target: { value: "330" } });
    fireEvent.change(within(step).getByLabelText("2024"), { target: { value: "120" } });
    fireEvent.click(within(step).getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(
        within(card(/residency/i)).getByRole("link", { name: /open/i }),
      ).toBeTruthy(),
    );
    expect(saveFacts).toHaveBeenCalledWith({
      days_by_year: { "2026": 300, "2025": 330, "2024": 120 },
    });
  });

  it("hides the W-2 step for green card holders and says why", () => {
    render(<ProfileGuide initialFacts={{ status_kind: "green_card" }} taxYear={2026} />);
    expect(screen.queryByRole("form", { name: /job and w-2/i })).toBeNull();
    expect(within(card(/fica/i)).getByText(/doesn't apply/i)).toBeTruthy();
  });

  it("asks for confirmation before deleting saved answers", async () => {
    deleteFacts.mockResolvedValue({ ok: true });
    render(<ProfileGuide initialFacts={{ status_kind: "f1" }} taxYear={2026} />);
    fireEvent.click(screen.getByRole("button", { name: /delete my saved answers/i }));
    expect(deleteFacts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /yes, delete/i }));
    await waitFor(() => expect(deleteFacts).toHaveBeenCalled());
  });
});

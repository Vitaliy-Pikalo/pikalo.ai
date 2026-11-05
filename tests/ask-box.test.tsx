import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import AskBox from "@/components/AskBox";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const fetchFn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

describe("AskBox", () => {
  it("shows the answer with linked citations and the tools used", async () => {
    const fetchFn = stubFetch(200, {
      status: "answered",
      answer: "You can put in up to $7,500 [1].",
      citations: [
        {
          n: 1,
          title: "Publication 590-A",
          section: "Limits",
          url: "https://www.irs.gov/p590a#x",
        },
      ],
      tools: [{ name: "roth_ira_limit", ok: true }],
    });
    render(<AskBox />);
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "roth limit?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => screen.getByText(/up to \$7,500/));
    expect(screen.getByLabelText("source 1").getAttribute("href")).toBe(
      "https://www.irs.gov/p590a#x",
    );
    expect(screen.getByText(/Roth IRA calculator/)).toBeTruthy();
    expect(
      JSON.parse(
        (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
      ),
    ).toEqual({
      question: "roth limit?",
    });
  });

  it("warns when an answer was held back", async () => {
    stubFetch(200, {
      status: "blocked",
      answer: "I couldn't verify…",
      citations: [],
      tools: [],
    });
    render(<AskBox />);
    fireEvent.click(screen.getAllByRole("button")[1]); // first example question
    await waitFor(() => screen.getByText(/Held back/));
  });

  it("shows API errors", async () => {
    stubFetch(429, { error: "Too many questions. Please wait a minute." });
    render(<AskBox />);
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "q" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => screen.getByText(/Too many questions/));
  });
});

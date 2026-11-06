import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPage from "@/app/privacy/page";

describe("privacy page", () => {
  it("states the commitments the code relies on", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/never ask for your Social Security number/);
    expect(text).toMatch(/deleted\s+after 90 days/);
    expect(text).toMatch(/Never the text of your\s+question/);
    expect(text).toMatch(/keyed hash of your IP address/);
    expect(text).toMatch(/for 2 days/);
  });

  it("links the AWS sources for its Bedrock claims and a contact address", () => {
    render(<PrivacyPage />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("https://aws.amazon.com/bedrock/faqs/");
    expect(hrefs).toContain(
      "https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html",
    );
    expect(hrefs).toContain("mailto:privacy@pikalo.org");
  });
});

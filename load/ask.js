import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

/* global __ENV */
const guardedAnswers = new Rate("guarded_answers");

const rate = Number(__ENV.RATE || 20);
const seconds = Number(__ENV.SECONDS || 180);
if (
  !Number.isInteger(rate) ||
  rate < 1 ||
  rate > 100 ||
  !Number.isInteger(seconds) ||
  seconds < 10 ||
  seconds > 600
) {
  throw new Error("Local test requires RATE 1..100 and SECONDS 10..600");
}
export const options = {
  scenarios: {
    local_fixture: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration: `${seconds}s`,
      preAllocatedVUs: 32,
      maxVUs: 128,
      gracefulStop: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    guarded_answers: ["rate>0.99"],
    dropped_iterations: ["count==0"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};
export default function askFixture() {
  const response = http.post(
    "http://answer-api:3000/api/ask",
    JSON.stringify({
      question: "I'm single and make $40,000. How much can I put in a Roth?",
    }),
    { headers: { "content-type": "application/json" }, timeout: "30s" },
  );
  let answer;
  try {
    answer = response.json();
  } catch {
    answer = {};
  }
  guardedAnswers.add(
    check(response, {
      "HTTP 200 and guarded answer": (r) =>
        r.status === 200 && answer.status === "answered",
      "actual successful MCP Roth result": () =>
        (answer.tools || []).some(
          (tool) =>
            tool.name === "roth_ira_limit" &&
            tool.ok &&
            tool.output.maxContribution === 7500,
        ),
      "citation present": () => (answer.citations || []).length > 0,
    }),
  );
}
export function handleSummary(data) {
  return { stdout: `K6_SUMMARY_JSON=${JSON.stringify(data)}\n` };
}

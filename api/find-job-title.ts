import type { VercelRequest, VercelResponse } from "@vercel/node";
import { findJobTitle } from "../src/jobTitle.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { name, companyDomain } = req.body ?? {};

  if (typeof name !== "string" || typeof companyDomain !== "string") {
    return res
      .status(400)
      .json({ error: "Both `name` and `companyDomain` must be provided." });
  }

  try {
    const result = await findJobTitle({ name, companyDomain });

    return res.status(200).json(result);
  } catch (error) {
    console.error("API error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch job title";
    return res.status(500).json({ error: message });
  }
}

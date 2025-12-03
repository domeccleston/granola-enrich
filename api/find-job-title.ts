import type { VercelRequest, VercelResponse } from "@vercel/node";

import * as dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const SENIORITY_LEVELS = [
  "Entry-Level",
  "Individual Contributor (Mid-Level)",
  "Senior Individual Contributor",
  "Mid-Management",
  "Senior Management",
  "Executive Leadership",
] as const;

const SENIORITY_DESCRIPTIONS: Record<
  (typeof SENIORITY_LEVELS)[number],
  string
> = {
  "Entry-Level":
    "Beginner roles focused on learning and support work with close supervision. ~0-2 years exp. Examples: Intern, Assistant, Junior Analyst.",
  "Individual Contributor (Mid-Level)":
    "Skilled ICs who execute independently but do not manage people. ~2-5 years exp. Examples: Account Executive, Specialist, Analyst, Coordinator.",
  "Senior Individual Contributor":
    "Experienced ICs leading projects or mentoring without direct reports. ~5-10+ years exp. Examples: Senior Account Executive, Lead Engineer, Principal Scientist.",
  "Mid-Management":
    "People managers running teams or pods and handling day-to-day operations. Often 5-10+ years exp. Examples: Manager, Supervisor, Project Manager.",
  "Senior Management":
    "Department or regional leaders who manage managers and set functional strategy. Typically Directors or VPs.",
  "Executive Leadership":
    "C-suite or equivalent roles guiding company-wide vision (CEO, CFO, President, CRO, Board Member).",
};

const DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "Marketing",
  "Customer Success",
  "Operations",
  "Finance",
  "HR/People",
  "Legal",
  "Data/Analytics",
  "Other",
] as const;

interface PersonInput {
  name: string;
  email: string;
}

interface JobTitleResult {
  name: string;
  jobTitle: string | null;
  linkedInUrl: string | null;
  seniority: (typeof SENIORITY_LEVELS)[number] | null;
  department: (typeof DEPARTMENTS)[number] | null;
  error?: string;
}

interface SerpApiResult {
  organic_results?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
  error?: string;
}

function extractDomainFromEmail(email: string): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const trimmedEmail = email.trim();
  const atIndex = trimmedEmail.lastIndexOf("@");

  if (atIndex === -1 || atIndex === trimmedEmail.length - 1) {
    return null;
  }

  const domain = trimmedEmail.slice(atIndex + 1).toLowerCase();

  // Basic validation, allowing subdomains (e.g., mail.company.co.uk)
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return null;
  }

  return domain;
}

async function searchWithSerpApi(query: string): Promise<SerpApiResult> {
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) {
    throw new Error("SERP_API_KEY not found in environment variables");
  }

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: "google",
  });

  const url = `https://serpapi.com/search?${params.toString()}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching from SerpAPI:", error);
    throw error;
  }
}

function extractJobTitle(title: string, snippet: string): string | null {
  const titleParts = title.split(/\s*[-–|]\s*/);
  if (titleParts.length >= 2) {
    const potentialTitle = titleParts[1].trim();
    if (
      potentialTitle.length > 3 &&
      !potentialTitle.toLowerCase().includes("linkedin") &&
      !potentialTitle.toLowerCase().includes("profile")
    ) {
      return potentialTitle;
    }
  }

  const jobTitlePatterns = [
    /\b(Chief\s+\w+\s+Officer)\b/i,
    /\b(CEO|CTO|CFO|COO|CMO|CIO)\b/,
    /\b(Vice\s+President|VP)\s+(?:of\s+)?(\w+(?:\s+\w+)?)/i,
    /\b(Senior|Lead|Principal|Staff)?\s*(Software|Data|Product|Marketing|Sales|Operations)?\s*(Engineer|Developer|Manager|Director|Analyst|Designer|Architect)/i,
    /\b(Founder|Co-Founder)\b/i,
    /\b(President(?:\s+(?:and|&)\s+\w+)?)\b/i,
    /\b(Chairman(?:\s+(?:and|&)\s+\w+)?)\b/i,
  ];

  for (const pattern of jobTitlePatterns) {
    const match = snippet.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return null;
}

async function categorizeJobTitle(jobTitle: string): Promise<{
  seniority: (typeof SENIORITY_LEVELS)[number] | null;
  department: (typeof DEPARTMENTS)[number] | null;
}> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("OPENAI_API_KEY not found, skipping categorization");
    return { seniority: null, department: null };
  }

  const client = new OpenAI({ apiKey });

  const seniorityGuidance = SENIORITY_LEVELS.map(
    (level) => `- ${level}: ${SENIORITY_DESCRIPTIONS[level]}`,
  ).join("\n");

  const prompt = `Rank the job title "${jobTitle}" into the single best seniority bucket and department.

SENIORITY BUCKETS:
${seniorityGuidance}

DEPARTMENTS:
${DEPARTMENTS.map((d) => `- ${d}`).join("\n")}

Instructions:
- Always pick exactly one seniority bucket and one department label from the lists above.
- Treat "Head of", "VP of", and similar leadership phrasing as Mid-Management or higher depending on scope.
- Map ambiguous roles to the closest matching department.

Respond ONLY with compact JSON in this format:
{"seniority":"<bucket name>","department":"<department name>"}`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(responseText);

    return {
      seniority: parsed.seniority || null,
      department: parsed.department || null,
    };
  } catch (error) {
    console.error("Error categorizing job title:", error);
    return { seniority: null, department: null };
  }
}

async function findJobTitle(person: PersonInput): Promise<JobTitleResult> {
  const companyDomain = extractDomainFromEmail(person.email);

  if (!companyDomain) {
    return {
      name: person.name,
      jobTitle: null,
      linkedInUrl: null,
      seniority: null,
      department: null,
      error: "Could not derive company domain from email address",
    };
  }

  console.log(`Searching for ${person.name} at ${companyDomain}...`);

  const query = `${person.name} ${companyDomain} site:linkedin.com/in`;

  try {
    const searchResults = await searchWithSerpApi(query);

    if (
      !searchResults.organic_results ||
      searchResults.organic_results.length === 0
    ) {
      return {
        name: person.name,
        jobTitle: null,
        linkedInUrl: null,
        seniority: null,
        department: null,
        error: "No LinkedIn profiles found",
      };
    }

    for (const result of searchResults.organic_results.slice(0, 3)) {
      if (!result.link || !result.link.includes("linkedin.com/in/")) {
        continue;
      }

      const title = result.title || "";
      const snippet = result.snippet || "";

      const jobTitle = extractJobTitle(title, snippet);

      if (jobTitle) {
        console.log("Categorizing job title with OpenAI...");
        const categorization = await categorizeJobTitle(jobTitle);

        return {
          name: person.name,
          jobTitle,
          linkedInUrl: result.link,
          seniority: categorization.seniority,
          department: categorization.department,
        };
      }
    }

    const firstLinkedIn = searchResults.organic_results.find(
      (r) => r.link && r.link.includes("linkedin.com/in/"),
    );

    return {
      name: person.name,
      jobTitle: null,
      linkedInUrl: firstLinkedIn?.link || null,
      seniority: null,
      department: null,
      error: firstLinkedIn
        ? "Found LinkedIn profile but could not extract job title"
        : "No LinkedIn profiles found",
    };
  } catch (error) {
    return {
      name: person.name,
      jobTitle: null,
      linkedInUrl: null,
      seniority: null,
      department: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export { findJobTitle, PersonInput, JobTitleResult };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { name, email } = req.body ?? {};

  if (typeof name !== "string" || typeof email !== "string") {
    return res
      .status(400)
      .json({ error: "Both `name` and `email` must be provided." });
  }

  if (!extractDomainFromEmail(email)) {
    return res
      .status(400)
      .json({ error: "A valid work email is required to derive the company domain." });
  }

  try {
    const result = await findJobTitle({ name, email });

    return res.status(200).json(result);
  } catch (error) {
    console.error("API error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch job title";
    return res.status(500).json({ error: message });
  }
}

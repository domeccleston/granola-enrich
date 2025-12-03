# LinkedIn Job Title Search

A TypeScript script to search for a person's job title using their name and company domain via SerpAPI.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Make sure you have a `.env` file with your SerpAPI key (and optionally an OpenAI key for categorization):
```
SERP_API_KEY=your_api_key_here
OPENAI_API_KEY=optional_openai_key
```



## Usage

### Serverless API (Vercel-ready)

Deploy the repo to Vercel (or run `vercel dev`) and call the POST endpoint:

```bash
curl -X POST https://<your-vercel-app>.vercel.app/api/find-job-title \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "companyDomain": "example.com"}'
```

The response is a `JobTitleResult` JSON object containing the LinkedIn URL, extracted title, and categorization metadata.

### As a Script

Edit the test person in `src/index.ts`:

```typescript
const testPerson: PersonInput = {
  name: 'John Doe',
  companyDomain: 'example.com',
};
```

Then run directly with tsx:

```bash
npm run start
```

### As a Module

Import and use the `findJobTitle` function:

```typescript
import { findJobTitle } from './jobTitle.js';

const result = await findJobTitle({
  name: 'Jane Smith',
  companyDomain: 'company.com',
});

console.log('Job Title:', result.jobTitle);
console.log('LinkedIn URL:', result.linkedInUrl);
```

## How It Works

1. Constructs a Google search query targeting LinkedIn profiles
2. Uses SerpAPI to perform the search
3. Parses search results to find LinkedIn profile URLs
4. Extracts job title from the search result title or snippet
5. Returns the job title and LinkedIn profile URL

## Output Format

```typescript
{
  name: string;           // The person's name
  jobTitle: string | null; // Extracted job title, or null if not found
  linkedInUrl: string | null; // LinkedIn profile URL, or null if not found
  error?: string;         // Error message if something went wrong
}
```

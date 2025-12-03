import { findJobTitle } from "./jobTitle.js";
async function main() {
    const testPerson = {
        name: "Don Fogarty",
        companyDomain: "attio.com",
    };
    const result = await findJobTitle(testPerson);
    console.log("\n=== Results ===");
    console.log("Name:", result.name);
    console.log("Job Title:", result.jobTitle || "Not found");
    console.log("Seniority:", result.seniority || "Not categorized");
    console.log("Department:", result.department || "Not categorized");
    console.log("LinkedIn URL:", result.linkedInUrl || "Not found");
    if (result.error) {
        console.log("Error:", result.error);
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

import { TargetBucket } from "./store";

export async function scoreJobWithAI(jdText: string, company: string, role: string, location: string, seniority: string, sector: string, buckets: TargetBucket[], apiKey: string) {
  if (!apiKey) throw new Error("Missing OpenAI API Key");

  // Step 1: Extract structured data from JD using OpenAI
  const prompt = `
You are an expert technical recruiter analyzing a Job Description.
Job: ${role} at ${company}
Location: ${location}
Seniority: ${seniority}
Sector: ${sector}

Job Description:
${jdText.substring(0, 4000)}

Extract the following and return ONLY raw JSON (no markdown formatting or backticks):
{
  "keyRequirements": ["string"],
  "technicalSkills": ["string"],
  "softSkills": ["string"],
  "yearsExperienceRequired": number or null,
  "redFlags": ["string"]
}
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Error: ${response.status} ${err}`);
  }

  const result = await response.json();
  let parsed;
  try {
    let cleanText = result.choices[0].message.content.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.substring(7, cleanText.length - 3);
    }
    parsed = JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse OpenAI JSON:", result.choices[0].message.content);
    throw new Error("Failed to parse OpenAI response");
  }

  // Combine extracted skills with our metadata for scoring
  const fullText = `${jdText} ${parsed.technicalSkills?.join(" ")} ${parsed.keyRequirements?.join(" ")}`.toLowerCase();

  // Find best matching bucket
  let bestBucket = buckets[0];
  let highestScore = 0;
  let bestBreakdown = {};

  for (const bucket of buckets) {
    let score = 0;
    const breakdown: any = {};

    // 1. Title Match (0-3)
    const titleLower = role.toLowerCase();
    const titleMatch = bucket.titlesMatch.some(t => titleLower.includes(t));
    const titleExclude = bucket.titlesExclude.some(t => titleLower.includes(t));
    let titleScore = titleExclude ? 0 : titleMatch ? 3 : 1;
    score += titleScore;
    breakdown.titleMatch = { score: titleScore, weighted: titleScore };

    // 2. Sector Match (0-1.5)
    const sectorMatch = bucket.sectorsPreferred.some(s => sector.toLowerCase().includes(s));
    let sectorScore = sectorMatch ? 1.5 : 0;
    score += sectorScore;
    breakdown.sectorMatch = { score: sectorScore, weighted: sectorScore };

    // 3. Keywords Required (0-3)
    const reqMatches = bucket.keywordsRequired.filter(k => fullText.includes(k.toLowerCase()));
    let reqScore = (reqMatches.length / Math.max(1, bucket.keywordsRequired.length)) * 3;
    score += reqScore;
    breakdown.keywordsRequired = { score: reqScore, weighted: reqScore };

    // 4. Keywords Boost (0-2.5)
    const boostMatches = bucket.keywordsBoost.filter(k => fullText.includes(k.toLowerCase()));
    let boostScore = Math.min(2.5, boostMatches.length * 0.8);
    score += boostScore;
    breakdown.keywordsBoost = { score: boostScore, weighted: boostScore };

    if (score > highestScore) {
      highestScore = score;
      bestBucket = bucket;
      bestBreakdown = breakdown;
    }
  }

  return {
    totalScore: Math.min(10, highestScore),
    bucket: bestBucket.id,
    bucketName: bestBucket.name,
    recommendation: highestScore >= 8.5 ? "Apply Immediately" : highestScore >= 7.0 ? "Tailor and Apply" : "Review Manually",
    breakdown: bestBreakdown,
    parsed
  };
}
export async function getAIRecommendation(userPrompt, products) {
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const URL =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

  const limitedProducts = products.slice(0, 5);

const promptText = `
You are a STRICT multilingual e-commerce product search system.

RULES:
- Return ONLY products from PRODUCT LIST
- NEVER invent products
- Output must be valid JSON only
- If no match, return []

MULTILINGUAL SUPPORT:
- User query may be in English OR Urdu OR Roman Urdu
- You MUST understand meaning, not language
- Translate internally before matching:
  Urdu / Roman Urdu → English meaning

EXAMPLES:
"موبائل" = mobile phone / smartphone
"لیپ ٹاپ" = laptop
"جوتے" = shoes
"ٹی شرٹ" = t-shirt
"چارجر" = charger

MATCHING LOGIC:
1. Exact match
2. Meaning match (after translation)
3. Category match
4. Related products ONLY if already in list

USER QUERY:
${userPrompt}

PRODUCT LIST:
${JSON.stringify(limitedProducts)}

OUTPUT FORMAT:
[
  {
    "id": "string",
    "name": "string",
    "price": number
  }
]
`;

  let response;

  try {
    response = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: promptText }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400
        }
      })
    });
  } catch (err) {
    throw new Error("Failed to connect to Gemini API");
  }

  /**
   * 🚀 FIX 1: parse JSON directly (no rawText step)
   */
  const data = await response.json().catch(() => null);

  if (!response.ok || !data) {
    console.error("GEMINI ERROR:", data);
    throw new Error("Gemini API request failed");
  }

  const aiText =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!aiText) {
    throw new Error("Empty AI response from Gemini");
  }

  /**
   * 🚀 FIX 2: safer JSON extraction (regex instead of fragile indexOf)
   */
  const extractJSON = (text) => {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? match[0] : null;
  };

  const jsonString = extractJSON(aiText);

  if (!jsonString) {
    console.error("RAW AI TEXT:", aiText);
    throw new Error("No valid JSON array found in AI response");
  }

  try {
    const result = JSON.parse(jsonString);

    if (!Array.isArray(result)) {
      throw new Error("AI response is not an array");
    }

    return result
      .filter(item => item?.id && item?.name)
      .map(item => ({
        id: item.id,
        name: item.name,
        price: item.price ?? 0
      }));

  } catch (err) {
    console.error("FAILED PARSE:", jsonString);
    throw new Error("Failed to parse AI recommendation JSON");
  }
}
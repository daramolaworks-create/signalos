const riskKeywords: Record<string, string[]> = {
  politics: ['election', 'president', 'senate', 'congress', 'democrat', 'republican', 'government', 'war policy'],
  religion: ['god', 'church', 'islam', 'christian', 'jewish', 'hindu', 'religion', 'faith'],
  medical: ['cure', 'diagnosis', 'vaccine', 'cancer', 'depression', 'anxiety', 'medicine', 'doctor'],
  financial: ['buy this stock', 'sell this stock', 'financial advice', 'guaranteed return', 'get rich quick'],
  hate: ['racial slur', 'ethnic cleansing', 'inferior race'],
  attacks: ['idiot', 'moron', 'scam artist', 'criminal'],
  tragedy: ['mass shooting', 'suicide', 'natural disaster', 'terror attack'],
  violence: ['kill', 'murder', 'assault', 'bomb', 'genocide']
};

export type RiskResult = {
  score: number;
  categories: string[];
};

export function scorePostRisk(content: string): RiskResult {
  const normalized = content.toLowerCase();
  const matchedCategories = Object.entries(riskKeywords)
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([category]) => category);

  const score = Math.min(1, matchedCategories.length * 0.25);

  return {
    score,
    categories: matchedCategories
  };
}

export function isApprovalSafe(content: string): boolean {
  return scorePostRisk(content).score <= 0.7;
}

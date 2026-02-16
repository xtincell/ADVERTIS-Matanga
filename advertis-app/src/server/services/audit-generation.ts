// Audit Generation Service — Phase 2 (R + T)
// R = Risk: micro-SWOT per A-E variable + global SWOT synthesis + risk score 0-100
// T = Track: market validation, hypothesis triangulation, TAM/SAM/SOM
// 100% AI-generated — no user input required.

import { generateText } from "ai";

import { anthropic, DEFAULT_MODEL } from "./anthropic-client";
import { PILLAR_CONFIG } from "~/lib/constants";
import type { PillarType } from "~/lib/constants";
import { getFicheDeMarqueSchema } from "~/lib/interview-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MicroSwot {
  variableId: string;
  variableLabel: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  riskLevel: "low" | "medium" | "high";
  commentary: string;
}

export interface RiskAuditResult {
  microSwots: MicroSwot[];
  globalSwot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  riskScore: number; // 0-100
  riskScoreJustification: string;
  probabilityImpactMatrix: Array<{
    risk: string;
    probability: "low" | "medium" | "high";
    impact: "low" | "medium" | "high";
    priority: number; // 1-5
  }>;
  mitigationPriorities: Array<{
    risk: string;
    action: string;
    urgency: "immediate" | "short_term" | "medium_term";
    effort: "low" | "medium" | "high";
  }>;
  summary: string;
}

export interface TrackAuditResult {
  triangulation: {
    internalData: string;
    marketData: string;
    customerData: string;
    synthesis: string;
  };
  hypothesisValidation: Array<{
    variableId: string;
    hypothesis: string;
    status: "validated" | "invalidated" | "to_test";
    evidence: string;
  }>;
  marketReality: {
    macroTrends: string[];
    weakSignals: string[];
    emergingPatterns: string[];
  };
  tamSamSom: {
    tam: { value: string; description: string };
    sam: { value: string; description: string };
    som: { value: string; description: string };
    methodology: string;
  };
  competitiveBenchmark: Array<{
    competitor: string;
    strengths: string[];
    weaknesses: string[];
    marketShare: string;
  }>;
  brandMarketFitScore: number; // 0-100
  brandMarketFitJustification: string;
  strategicRecommendations: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Public API — Risk Audit (Pillar R)
// ---------------------------------------------------------------------------

/**
 * Generates the Risk audit (Pillar R).
 * Performs micro-SWOT analysis on each non-empty A-E variable, then synthesizes
 * a global SWOT with risk score and mitigation priorities.
 *
 * @param interviewData - A-E interview answers keyed by variable id
 * @param ficheContent - Already generated A-E pillar content (for deeper context)
 * @param brandName - Name of the brand
 * @param sector - Industry sector
 */
export async function generateRiskAudit(
  interviewData: Record<string, string>,
  ficheContent: Array<{ type: string; content: string }>,
  brandName: string,
  sector: string,
): Promise<RiskAuditResult> {
  const schema = getFicheDeMarqueSchema();

  // Collect non-empty variables for micro-SWOT analysis
  const filledVariables: Array<{
    id: string;
    label: string;
    pillar: string;
    value: string;
  }> = [];

  for (const section of schema) {
    for (const variable of section.variables) {
      const value = interviewData[variable.id]?.trim();
      if (value) {
        filledVariables.push({
          id: variable.id,
          label: variable.label,
          pillar: section.pillarType,
          value,
        });
      }
    }
  }

  // Build context from fiche pillars
  const ficheContext = ficheContent
    .map((p) => {
      const config = PILLAR_CONFIG[p.type as PillarType];
      const truncated =
        p.content.length > 3000
          ? p.content.substring(0, 3000) + "\n[... tronqué ...]"
          : p.content;
      return `### Pilier ${p.type} — ${config?.title ?? p.type}\n${truncated}`;
    })
    .join("\n\n");

  // --- Step 1: Batch micro-SWOT analysis ---
  // Instead of 25 individual calls, batch variables by pillar (4 calls)
  const microSwots: MicroSwot[] = [];
  const pillarGroups = new Map<string, typeof filledVariables>();

  for (const v of filledVariables) {
    const group = pillarGroups.get(v.pillar) ?? [];
    group.push(v);
    pillarGroups.set(v.pillar, group);
  }

  // Generate micro-SWOTs in parallel per pillar (max 4 parallel calls)
  const pillarPromises = Array.from(pillarGroups.entries()).map(
    async ([pillarType, variables]) => {
      const variablesList = variables
        .map((v) => `- ${v.id} (${v.label}): ${v.value}`)
        .join("\n");

      const { text } = await generateText({
        model: anthropic(DEFAULT_MODEL),
        system: `Tu es un auditeur stratégique expert utilisant la méthodologie ADVERTIS.
Tu dois réaliser une analyse micro-SWOT pour chaque variable du Pilier ${pillarType} — ${PILLAR_CONFIG[pillarType as PillarType]?.title}.

CONTEXTE DE LA MARQUE :
- Marque : ${brandName}
- Secteur : ${sector || "Non spécifié"}

DONNÉES DES PILIERS FICHE DE MARQUE :
${ficheContext}

INSTRUCTIONS :
Pour CHAQUE variable fournie, génère une analyse SWOT avec :
- strengths : 2-3 forces identifiées
- weaknesses : 2-3 faiblesses identifiées
- opportunities : 2-3 opportunités
- threats : 2-3 menaces
- riskLevel : "low", "medium" ou "high"
- commentary : 1-2 phrases de synthèse

FORMAT DE RÉPONSE :
Réponds UNIQUEMENT avec un tableau JSON valide d'objets micro-SWOT.
Exemple :
[
  {
    "variableId": "A1",
    "variableLabel": "Identité de Marque",
    "strengths": ["Force 1", "Force 2"],
    "weaknesses": ["Faiblesse 1"],
    "opportunities": ["Opportunité 1"],
    "threats": ["Menace 1"],
    "riskLevel": "medium",
    "commentary": "L'identité est bien définie mais manque de différenciation..."
  }
]`,
        prompt: `Variables du Pilier ${pillarType} à analyser :\n\n${variablesList}`,
        maxOutputTokens: 4000,
        temperature: 0.4,
      });

      return parseJsonArray<MicroSwot>(text);
    },
  );

  const pillarResults = await Promise.all(pillarPromises);
  for (const result of pillarResults) {
    microSwots.push(...result);
  }

  // --- Step 2: Global SWOT synthesis + risk score ---
  const microSwotSummary = microSwots
    .map(
      (ms) =>
        `${ms.variableId} (${ms.variableLabel}) — Risque: ${ms.riskLevel}\n` +
        `  Forces: ${ms.strengths.join(", ")}\n` +
        `  Faiblesses: ${ms.weaknesses.join(", ")}\n` +
        `  Opportunités: ${ms.opportunities.join(", ")}\n` +
        `  Menaces: ${ms.threats.join(", ")}`,
    )
    .join("\n\n");

  const { text: synthesisText } = await generateText({
    model: anthropic(DEFAULT_MODEL),
    system: `Tu es un auditeur stratégique expert utilisant la méthodologie ADVERTIS.
Tu dois synthétiser les micro-SWOTs individuels en une analyse globale.

CONTEXTE :
- Marque : ${brandName}
- Secteur : ${sector || "Non spécifié"}

INSTRUCTIONS :
À partir des micro-SWOTs individuels, génère :
1. Un SWOT global (patterns transversaux, pas la simple somme des SWOTs)
2. Un score de risque global 0-100 (0 = aucun risque, 100 = risque critique) avec justification
3. Une matrice probabilité × impact des 5-10 risques majeurs
4. Des priorités de mitigation classées par urgence

FORMAT : Réponds UNIQUEMENT avec un objet JSON valide :
{
  "globalSwot": {
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "opportunities": ["...", "..."],
    "threats": ["...", "..."]
  },
  "riskScore": 45,
  "riskScoreJustification": "...",
  "probabilityImpactMatrix": [
    { "risk": "...", "probability": "high", "impact": "high", "priority": 1 }
  ],
  "mitigationPriorities": [
    { "risk": "...", "action": "...", "urgency": "immediate", "effort": "medium" }
  ],
  "summary": "Synthèse en 3-5 phrases..."
}`,
    prompt: `Voici les micro-SWOTs individuels de la marque "${brandName}" :\n\n${microSwotSummary}`,
    maxOutputTokens: 3000,
    temperature: 0.3,
  });

  const synthesis = parseJsonObject<{
    globalSwot: RiskAuditResult["globalSwot"];
    riskScore: number;
    riskScoreJustification: string;
    probabilityImpactMatrix: RiskAuditResult["probabilityImpactMatrix"];
    mitigationPriorities: RiskAuditResult["mitigationPriorities"];
    summary: string;
  }>(synthesisText);

  return {
    microSwots,
    globalSwot: synthesis.globalSwot ?? {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    },
    riskScore: synthesis.riskScore ?? 50,
    riskScoreJustification:
      synthesis.riskScoreJustification ?? "Score non calculé",
    probabilityImpactMatrix: synthesis.probabilityImpactMatrix ?? [],
    mitigationPriorities: synthesis.mitigationPriorities ?? [],
    summary: synthesis.summary ?? "",
  };
}

// ---------------------------------------------------------------------------
// Public API — Track Audit (Pillar T)
// ---------------------------------------------------------------------------

/**
 * Generates the Track audit (Pillar T).
 * Market validation, hypothesis triangulation, TAM/SAM/SOM, competitive benchmark.
 *
 * @param interviewData - A-E interview answers
 * @param ficheContent - Generated A-E pillar content
 * @param riskResults - Results from Risk audit (R) for cross-reference
 * @param brandName - Brand name
 * @param sector - Industry sector
 */
export async function generateTrackAudit(
  interviewData: Record<string, string>,
  ficheContent: Array<{ type: string; content: string }>,
  riskResults: RiskAuditResult,
  brandName: string,
  sector: string,
): Promise<TrackAuditResult> {
  // Build comprehensive context
  const ficheContext = ficheContent
    .map((p) => {
      const config = PILLAR_CONFIG[p.type as PillarType];
      const truncated =
        p.content.length > 3000
          ? p.content.substring(0, 3000) + "\n[... tronqué ...]"
          : p.content;
      return `### Pilier ${p.type} — ${config?.title ?? p.type}\n${truncated}`;
    })
    .join("\n\n");

  // Summarize interview data
  const schema = getFicheDeMarqueSchema();
  const interviewSummary = schema
    .flatMap((section) =>
      section.variables
        .filter((v) => interviewData[v.id]?.trim())
        .map((v) => `- ${v.id} (${v.label}): ${interviewData[v.id]!.trim()}`),
    )
    .join("\n");

  // Risk audit summary for cross-reference
  const riskSummary = `Score de risque global : ${riskResults.riskScore}/100
${riskResults.riskScoreJustification}

SWOT Global :
- Forces : ${riskResults.globalSwot.strengths.join(", ")}
- Faiblesses : ${riskResults.globalSwot.weaknesses.join(", ")}
- Opportunités : ${riskResults.globalSwot.opportunities.join(", ")}
- Menaces : ${riskResults.globalSwot.threats.join(", ")}`;

  const { text } = await generateText({
    model: anthropic(DEFAULT_MODEL),
    system: `Tu es un analyste marché expert utilisant la méthodologie ADVERTIS.
Tu réalises le Pilier T — Track : validation de la stratégie par confrontation aux données marché.

CONTEXTE DE LA MARQUE :
- Marque : ${brandName}
- Secteur : ${sector || "Non spécifié"}

DONNÉES FICHE DE MARQUE (A-D-V-E) :
${ficheContext}

DONNÉES D'ENTRETIEN :
${interviewSummary}

RÉSULTATS AUDIT R (Risk) :
${riskSummary}

INSTRUCTIONS :
Génère une analyse Track complète avec :

1. **Triangulation 3 sources** : croise données internes (fiche de marque), données marché (tendances sectorielles connues), et données clients (insights des personas)

2. **Validation des hypothèses** : pour chaque variable A-E non vide, évalue si l'hypothèse est validée, invalidée ou à tester par rapport aux réalités du marché

3. **Rapport réalité marché** : tendances macro, signaux faibles, patterns émergents dans le secteur "${sector}"

4. **TAM/SAM/SOM** : estimations chiffrées réalistes basées sur le secteur et le positionnement

5. **Benchmarking concurrentiel** : 3-5 concurrents avec forces/faiblesses/parts de marché (basé sur les données D2 si disponibles)

6. **Score Brand-Market Fit** : 0-100 avec justification

7. **Recommandations stratégiques** : 5-8 recommandations issues de l'analyse Track

FORMAT : Réponds UNIQUEMENT avec un objet JSON valide :
{
  "triangulation": {
    "internalData": "Synthèse données internes...",
    "marketData": "Synthèse données marché...",
    "customerData": "Synthèse données clients...",
    "synthesis": "Synthèse croisée..."
  },
  "hypothesisValidation": [
    { "variableId": "A1", "hypothesis": "...", "status": "validated", "evidence": "..." }
  ],
  "marketReality": {
    "macroTrends": ["..."],
    "weakSignals": ["..."],
    "emergingPatterns": ["..."]
  },
  "tamSamSom": {
    "tam": { "value": "X Mrd EUR", "description": "..." },
    "sam": { "value": "X M EUR", "description": "..." },
    "som": { "value": "X M EUR", "description": "..." },
    "methodology": "..."
  },
  "competitiveBenchmark": [
    { "competitor": "...", "strengths": ["..."], "weaknesses": ["..."], "marketShare": "..." }
  ],
  "brandMarketFitScore": 65,
  "brandMarketFitJustification": "...",
  "strategicRecommendations": ["..."],
  "summary": "Synthèse en 3-5 phrases..."
}`,
    prompt: `Réalise l'analyse Track complète pour la marque "${brandName}" dans le secteur "${sector || "Non spécifié"}".

Base ton analyse sur les données fournies dans le contexte. Sois factuel et précis. Si des données manquent, indique-le explicitement plutôt que d'inventer.`,
    maxOutputTokens: 6000,
    temperature: 0.3,
  });

  const result = parseJsonObject<TrackAuditResult>(text);

  return {
    triangulation: result.triangulation ?? {
      internalData: "",
      marketData: "",
      customerData: "",
      synthesis: "",
    },
    hypothesisValidation: result.hypothesisValidation ?? [],
    marketReality: result.marketReality ?? {
      macroTrends: [],
      weakSignals: [],
      emergingPatterns: [],
    },
    tamSamSom: result.tamSamSom ?? {
      tam: { value: "", description: "" },
      sam: { value: "", description: "" },
      som: { value: "", description: "" },
      methodology: "",
    },
    competitiveBenchmark: result.competitiveBenchmark ?? [],
    brandMarketFitScore: result.brandMarketFitScore ?? 50,
    brandMarketFitJustification:
      result.brandMarketFitJustification ?? "Score non calculé",
    strategicRecommendations: result.strategicRecommendations ?? [],
    summary: result.summary ?? "",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse AI response as a JSON array, with fallback to empty array.
 */
function parseJsonArray<T>(responseText: string): T[] {
  let jsonString = responseText.trim();

  // Remove markdown code block if present
  const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    jsonString = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonString) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(
      "[Audit] Failed to parse JSON array:",
      responseText.substring(0, 200),
    );
    return [];
  }
}

/**
 * Parse AI response as a JSON object, with fallback to empty object.
 */
function parseJsonObject<T>(responseText: string): Partial<T> {
  let jsonString = responseText.trim();

  // Remove markdown code block if present
  const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    jsonString = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonString) as Partial<T>;
  } catch {
    console.error(
      "[Audit] Failed to parse JSON object:",
      responseText.substring(0, 200),
    );
    return {} as Partial<T>;
  }
}

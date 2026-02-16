"use client";

import {
  Target,
  Shield,
  TrendingUp,
  Users,
  Lightbulb,
  AlertTriangle,
  BarChart3,
  Rocket,
  FileText,
  Award,
} from "lucide-react";

import { PILLAR_CONFIG, REPORT_CONFIG } from "~/lib/constants";
import type { PillarType, ReportType } from "~/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PillarData {
  type: string;
  title: string;
  status: string;
  summary: string | null;
  content: unknown;
}

interface DocumentData {
  id: string;
  type: string;
  title: string;
  status: string;
  pageCount: number | null;
  sections?: unknown;
}

export interface CockpitData {
  brandName: string;
  name: string;
  sector: string | null;
  description: string | null;
  phase: string;
  coherenceScore: number | null;
  pillars: PillarData[];
  documents: DocumentData[];
}

// ---------------------------------------------------------------------------
// Main Cockpit Content
// ---------------------------------------------------------------------------

export function CockpitContent({
  data,
  isPublic = false,
}: {
  data: CockpitData;
  isPublic?: boolean;
}) {
  const getPillar = (type: string) =>
    data.pillars.find((p) => p.type === type);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getContent = (type: string): Record<string, any> | null => {
    const pillar = getPillar(type);
    if (!pillar?.content) return null;
    if (typeof pillar.content === "object") return pillar.content as Record<string, any>;
    try {
      return JSON.parse(pillar.content as string) as Record<string, any>;
    } catch {
      return null;
    }
  };

  const riskContent = getContent("R");
  const trackContent = getContent("T");

  return (
    <div className="space-y-8">
      {/* ─── Brand Overview ─── */}
      <section>
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            {data.brandName}
          </h1>
          <p className="text-lg text-muted-foreground">{data.name}</p>
          {data.sector && (
            <p className="text-sm text-muted-foreground">
              Secteur : {data.sector}
            </p>
          )}
          {data.description && (
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              {data.description}
            </p>
          )}
        </div>

        {/* Coherence Score */}
        {data.coherenceScore !== null && (
          <div className="mx-auto flex max-w-xs flex-col items-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-terracotta/30 bg-terracotta/5">
              <span className="text-3xl font-bold text-terracotta">
                {data.coherenceScore}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              Score de Cohérence
            </p>
          </div>
        )}
      </section>

      {/* ─── Brand DNA (Pillar A) ─── */}
      <CockpitSection
        icon={<Lightbulb className="h-5 w-5" />}
        title="ADN de Marque"
        subtitle="Authenticité — Identité, Valeurs, Raison d'être"
        color={PILLAR_CONFIG.A.color}
      >
        <PillarContentDisplay pillar={getPillar("A")} />
      </CockpitSection>

      {/* ─── Positioning (Pillar D) ─── */}
      <CockpitSection
        icon={<Target className="h-5 w-5" />}
        title="Positionnement & Distinction"
        subtitle="Personas, Promesses, Identité visuelle"
        color={PILLAR_CONFIG.D.color}
      >
        <PillarContentDisplay pillar={getPillar("D")} />
      </CockpitSection>

      {/* ─── Value Canvas (Pillar V) ─── */}
      <CockpitSection
        icon={<TrendingUp className="h-5 w-5" />}
        title="Proposition de Valeur"
        subtitle="Product Ladder, Unit Economics, CODB"
        color={PILLAR_CONFIG.V.color}
      >
        <PillarContentDisplay pillar={getPillar("V")} />
      </CockpitSection>

      {/* ─── Engagement (Pillar E) ─── */}
      <CockpitSection
        icon={<Users className="h-5 w-5" />}
        title="Engagement & Communauté"
        subtitle="Touchpoints, Rituels, AARRR, Gamification"
        color={PILLAR_CONFIG.E.color}
      >
        <PillarContentDisplay pillar={getPillar("E")} />
      </CockpitSection>

      {/* ─── Risk Radar (Pillar R) ─── */}
      <CockpitSection
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Analyse des Risques"
        subtitle="Micro-SWOTs, Score de risque, Mitigation"
        color={PILLAR_CONFIG.R.color}
      >
        {riskContent ? (
          <div className="space-y-4">
            {/* Risk score */}
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-red-200 bg-red-50">
                <span className="text-xl font-bold text-red-600">
                  {String(riskContent.riskScore ?? "–")}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium">Score de risque</p>
                <p className="text-xs text-muted-foreground">
                  {String(riskContent.riskScoreJustification ?? "")}
                </p>
              </div>
            </div>

            {/* Global SWOT */}
            {riskContent.globalSwot && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SwotCard
                  title="Forces"
                  items={(riskContent.globalSwot as Record<string, string[]>).strengths ?? []}
                  color="green"
                />
                <SwotCard
                  title="Faiblesses"
                  items={(riskContent.globalSwot as Record<string, string[]>).weaknesses ?? []}
                  color="red"
                />
                <SwotCard
                  title="Opportunités"
                  items={(riskContent.globalSwot as Record<string, string[]>).opportunities ?? []}
                  color="blue"
                />
                <SwotCard
                  title="Menaces"
                  items={(riskContent.globalSwot as Record<string, string[]>).threats ?? []}
                  color="amber"
                />
              </div>
            )}

            {riskContent.summary && (
              <p className="text-sm text-muted-foreground">
                {String(riskContent.summary)}
              </p>
            )}
          </div>
        ) : (
          <PillarContentDisplay pillar={getPillar("R")} />
        )}
      </CockpitSection>

      {/* ─── Market Validation (Pillar T) ─── */}
      <CockpitSection
        icon={<BarChart3 className="h-5 w-5" />}
        title="Validation Marché"
        subtitle="TAM/SAM/SOM, Brand-Market Fit, Benchmarking"
        color={PILLAR_CONFIG.T.color}
      >
        {trackContent ? (
          <div className="space-y-4">
            {/* Brand-Market Fit score */}
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-purple-200 bg-purple-50">
                <span className="text-xl font-bold text-purple-600">
                  {String(trackContent.brandMarketFitScore ?? "–")}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium">Brand-Market Fit</p>
                <p className="text-xs text-muted-foreground">
                  {String(trackContent.brandMarketFitJustification ?? "")}
                </p>
              </div>
            </div>

            {/* TAM/SAM/SOM */}
            {trackContent.tamSamSom && (
              <div className="grid gap-3 sm:grid-cols-3">
                {(["tam", "sam", "som"] as const).map((key) => {
                  const data = (trackContent.tamSamSom as Record<string, { value: string; description: string }>)[key];
                  return (
                    <Card key={key} className="text-center">
                      <CardContent className="pt-4">
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          {key.toUpperCase()}
                        </p>
                        <p className="mt-1 text-lg font-bold">
                          {data?.value ?? "–"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {data?.description ?? ""}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Strategic recommendations */}
            {trackContent.strategicRecommendations &&
              Array.isArray(trackContent.strategicRecommendations) && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">
                    Recommandations stratégiques
                  </h4>
                  <ul className="space-y-1">
                    {(trackContent.strategicRecommendations as string[]).map(
                      (rec, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-500" />
                          {rec}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}

            {trackContent.summary && (
              <p className="text-sm text-muted-foreground">
                {String(trackContent.summary)}
              </p>
            )}
          </div>
        ) : (
          <PillarContentDisplay pillar={getPillar("T")} />
        )}
      </CockpitSection>

      {/* ─── Reports Access ─── */}
      {data.documents.length > 0 && (
        <CockpitSection
          icon={<FileText className="h-5 w-5" />}
          title="Rapports Stratégiques"
          subtitle={`${data.documents.length} rapports générés`}
          color="#3cc4c4"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.documents.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">{doc.title}</p>
                  </div>
                  {doc.pageCount && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {doc.pageCount} pages
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CockpitSection>
      )}

      {/* ─── Footer / Branding ─── */}
      <footer className="border-t pt-6 text-center">
        <p className="text-xs text-muted-foreground">
          Généré avec la méthodologie{" "}
          <span className="font-semibold text-terracotta">ADVERTIS</span>
          {" "}— Stratégie de marque en 8 piliers
        </p>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CockpitSection({
  icon,
  title,
  subtitle,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className="overflow-hidden"
      style={{ borderTopWidth: "3px", borderTopColor: color }}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: color }}
          >
            {icon}
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{subtitle}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PillarContentDisplay({ pillar }: { pillar?: PillarData | null }) {
  if (!pillar) {
    return (
      <p className="text-sm text-muted-foreground">
        Données non disponibles.
      </p>
    );
  }

  if (pillar.status !== "complete") {
    return (
      <p className="text-sm text-muted-foreground">
        Ce pilier n&apos;a pas encore été généré.
      </p>
    );
  }

  const content =
    typeof pillar.content === "string"
      ? pillar.content
      : JSON.stringify(pillar.content, null, 2);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
      {content}
    </div>
  );
}

function SwotCard({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: "green" | "red" | "blue" | "amber";
}) {
  const colorMap = {
    green: "border-green-200 bg-green-50/50",
    red: "border-red-200 bg-red-50/50",
    blue: "border-blue-200 bg-blue-50/50",
    amber: "border-amber-200 bg-amber-50/50",
  };

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color]}`}>
      <p className="mb-2 text-xs font-semibold uppercase">{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

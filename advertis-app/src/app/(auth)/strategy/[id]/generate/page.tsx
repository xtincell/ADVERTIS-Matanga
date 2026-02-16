"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Check,
  X,
  Loader2,
  RotateCcw,
  Sparkles,
  CircleDashed,
  Eye,
  StopCircle,
  Play,
  FileText,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";

import { api } from "~/trpc/react";
import {
  PILLAR_CONFIG,
  PHASE_CONFIG,
  FICHE_PILLARS,
  AUDIT_PILLARS,
  REPORT_TYPES,
  REPORT_CONFIG,
} from "~/lib/constants";
import type { PillarType, Phase, ReportType } from "~/lib/constants";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { ScrollArea } from "~/components/ui/scroll-area";
import { PhaseTimeline, PhaseBadge } from "~/components/strategy/phase-timeline";
import { ReportCard } from "~/components/strategy/report-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PillarStatus = "pending" | "generating" | "complete" | "error";

interface PillarState {
  id: string;
  type: string;
  title: string;
  status: PillarStatus;
  content: string | null;
  errorMessage: string | null;
}

interface DocumentStatus {
  id: string;
  type: string;
  title: string;
  status: string;
  pageCount: number | null;
  errorMessage: string | null;
  generatedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Main Generation Page — Phased Pipeline
// ---------------------------------------------------------------------------

export default function GeneratePage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;

  // State
  const [pillars, setPillars] = useState<PillarState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const cancelledRef = useRef(false);

  // Fetch strategy
  const {
    data: strategy,
    refetch: refetchStrategy,
  } = api.strategy.getById.useQuery(
    { id: strategyId },
    { enabled: !!strategyId, refetchInterval: isGenerating ? 3000 : false },
  );

  // Fetch document status
  const {
    data: documents,
    refetch: refetchDocuments,
  } = api.document.getStatus.useQuery(
    { strategyId },
    { enabled: !!strategyId, refetchInterval: isGenerating ? 3000 : false },
  );

  // Initialize pillar state
  useEffect(() => {
    if (strategy?.pillars) {
      setPillars(
        strategy.pillars.map((p) => ({
          id: p.id,
          type: p.type,
          title: p.title,
          status: p.status as PillarStatus,
          content:
            typeof p.content === "string"
              ? p.content
              : p.content
                ? JSON.stringify(p.content)
                : null,
          errorMessage: p.errorMessage,
        })),
      );
    }
  }, [strategy]);

  const currentPhase = (strategy?.phase as Phase) ?? "fiche";

  // ---------------------------------------------------------------------------
  // Generation logic
  // ---------------------------------------------------------------------------

  const generateSinglePillar = useCallback(
    async (pillarType: string) => {
      setPillars((prev) =>
        prev.map((p) =>
          p.type === pillarType
            ? { ...p, status: "generating" as PillarStatus, errorMessage: null }
            : p,
        ),
      );

      try {
        const response = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategyId, pillarType }),
        });

        const data = (await response.json()) as {
          success: boolean;
          pillar?: { type: string; status: string; content: unknown };
          error?: string;
        };

        if (data.success && data.pillar) {
          setPillars((prev) =>
            prev.map((p) =>
              p.type === pillarType
                ? {
                    ...p,
                    status: "complete" as PillarStatus,
                    content:
                      typeof data.pillar!.content === "string"
                        ? data.pillar!.content
                        : JSON.stringify(data.pillar!.content),
                    errorMessage: null,
                  }
                : p,
            ),
          );
          return true;
        } else {
          setPillars((prev) =>
            prev.map((p) =>
              p.type === pillarType
                ? {
                    ...p,
                    status: "error" as PillarStatus,
                    errorMessage: data.error ?? "Erreur inconnue",
                  }
                : p,
            ),
          );
          return false;
        }
      } catch (error) {
        setPillars((prev) =>
          prev.map((p) =>
            p.type === pillarType
              ? {
                  ...p,
                  status: "error" as PillarStatus,
                  errorMessage:
                    error instanceof Error ? error.message : "Erreur réseau",
                }
              : p,
          ),
        );
        return false;
      }
    },
    [strategyId],
  );

  // --- Launch Audit (R then T) ---
  const handleLaunchAudit = useCallback(async () => {
    setIsGenerating(true);
    setCurrentAction("audit");
    cancelledRef.current = false;

    // Generate R first
    const rSuccess = await generateSinglePillar("R");
    if (!rSuccess || cancelledRef.current) {
      setIsGenerating(false);
      setCurrentAction(null);
      void refetchStrategy();
      return;
    }

    // Then T
    await generateSinglePillar("T");

    setIsGenerating(false);
    setCurrentAction(null);
    void refetchStrategy();
  }, [generateSinglePillar, refetchStrategy]);

  // --- Launch Reports ---
  const handleLaunchReports = useCallback(async () => {
    setIsGenerating(true);
    setCurrentAction("reports");
    cancelledRef.current = false;

    try {
      const response = await fetch("/api/ai/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId }),
      });

      const data = (await response.json()) as {
        success: boolean;
        reports?: Array<{
          type: string;
          title: string;
          pageCount: number;
          totalWordCount: number;
        }>;
        error?: string;
      };

      if (!data.success) {
        console.error("[Reports] Generation failed:", data.error);
      }
    } catch (error) {
      console.error("[Reports] Error:", error);
    }

    setIsGenerating(false);
    setCurrentAction(null);
    void refetchStrategy();
    void refetchDocuments();
  }, [strategyId, refetchStrategy, refetchDocuments]);

  // --- Retry a single pillar ---
  const handleRetry = useCallback(
    async (pillarType: string) => {
      if (isGenerating) return;
      setIsGenerating(true);
      setCurrentAction(pillarType);
      await generateSinglePillar(pillarType);
      setIsGenerating(false);
      setCurrentAction(null);
      void refetchStrategy();
    },
    [isGenerating, generateSinglePillar, refetchStrategy],
  );

  // Cancel
  const handleCancel = () => {
    cancelledRef.current = true;
  };

  // ---------------------------------------------------------------------------
  // Phase helpers
  // ---------------------------------------------------------------------------

  const fichePillars = pillars.filter((p) =>
    FICHE_PILLARS.includes(p.type as PillarType),
  );
  const auditPillars = pillars.filter((p) =>
    AUDIT_PILLARS.includes(p.type as PillarType),
  );
  const ficheComplete = fichePillars.every((p) => p.status === "complete");
  const auditComplete = auditPillars.every((p) => p.status === "complete");
  const auditInProgress = auditPillars.some(
    (p) => p.status === "generating",
  );

  const reportDocs = (documents ?? []) as DocumentStatus[];
  const reportsComplete =
    reportDocs.length === 6 &&
    reportDocs.every((d) => d.status === "complete");
  const reportsInProgress = reportDocs.some(
    (d) => d.status === "generating",
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!strategy) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-terracotta" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Pipeline de génération
        </h1>
        <p className="text-muted-foreground">
          {strategy.brandName} — {strategy.name}
        </p>
      </div>

      {/* Phase Timeline */}
      <PhaseTimeline currentPhase={currentPhase} />

      {/* ─── Phase 1: Fiche de Marque (A-D-V-E) ─── */}
      <PhaseSection
        phase="fiche"
        currentPhase={currentPhase}
        title="Phase 1 : Fiche de Marque"
        description="Données collectées via le formulaire ou l'import de fichier"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {fichePillars.map((pillar) => {
            const config = PILLAR_CONFIG[pillar.type as PillarType];
            return (
              <PillarStatusCard
                key={pillar.id}
                pillar={pillar}
                config={config}
                onPreview={() =>
                  pillar.content &&
                  setPreviewContent({
                    title: `Pilier ${pillar.type} — ${config.title}`,
                    content: pillar.content,
                  })
                }
              />
            );
          })}
        </div>

        {ficheComplete && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700">
              Fiche de Marque complète — Prêt pour l&apos;audit
            </span>
          </div>
        )}

        {!ficheComplete && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700">
              Complétez la fiche pour déverrouiller l&apos;audit.{" "}
              <button
                onClick={() => router.push(`/strategy/new`)}
                className="font-medium underline hover:no-underline"
              >
                Compléter les données
              </button>
            </span>
          </div>
        )}
      </PhaseSection>

      {/* ─── Phase 2: Audit (R + T) ─── */}
      <PhaseSection
        phase="audit"
        currentPhase={currentPhase}
        title="Phase 2 : Audit stratégique"
        description="Analyse SWOT automatique + validation marché — 100% IA"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {auditPillars.map((pillar) => {
            const config = PILLAR_CONFIG[pillar.type as PillarType];
            return (
              <PillarStatusCard
                key={pillar.id}
                pillar={pillar}
                config={config}
                onPreview={() =>
                  pillar.content &&
                  setPreviewContent({
                    title: `Pilier ${pillar.type} — ${config.title}`,
                    content: pillar.content,
                  })
                }
                onRetry={() => handleRetry(pillar.type)}
              />
            );
          })}
        </div>

        {/* Launch audit button */}
        {currentPhase === "audit" &&
          !auditComplete &&
          !auditInProgress &&
          ficheComplete && (
            <div className="mt-4">
              <Button
                onClick={handleLaunchAudit}
                disabled={isGenerating}
                className="bg-terracotta hover:bg-terracotta/90"
              >
                {isGenerating && currentAction === "audit" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Lancer l&apos;audit R + T
              </Button>
            </div>
          )}

        {auditInProgress && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-terracotta">
              <Loader2 className="h-4 w-4 animate-spin" />
              Audit en cours...
            </div>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <StopCircle className="mr-1.5 h-3.5 w-3.5" />
              Annuler
            </Button>
          </div>
        )}

        {auditComplete && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700">
              Audit complet — Prêt pour la génération des rapports
            </span>
          </div>
        )}
      </PhaseSection>

      {/* ─── Phase 3: Rapports ─── */}
      <PhaseSection
        phase="implementation"
        currentPhase={currentPhase}
        title="Phase 3 : Rapports stratégiques"
        description="6 rapports de 15-80 pages — Génération section par section"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORT_TYPES.map((rt) => {
            const doc = reportDocs.find((d) => d.type === rt);
            return (
              <ReportCard
                key={rt}
                reportType={rt}
                status={
                  (doc?.status as "pending" | "generating" | "complete" | "error") ??
                  "pending"
                }
                pageCount={doc?.pageCount}
                errorMessage={doc?.errorMessage}
                generatedAt={doc?.generatedAt}
                onView={
                  doc?.status === "complete"
                    ? () =>
                        router.push(
                          `/strategy/${strategyId}/report/${doc.id}`,
                        )
                    : undefined
                }
              />
            );
          })}
        </div>

        {/* Launch reports button */}
        {(currentPhase === "implementation" ||
          (currentPhase === "audit" && auditComplete)) &&
          !reportsComplete &&
          !reportsInProgress && (
            <div className="mt-4">
              <Button
                onClick={handleLaunchReports}
                disabled={isGenerating || !auditComplete}
                className="bg-terracotta hover:bg-terracotta/90"
              >
                {isGenerating && currentAction === "reports" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Générer les 6 rapports
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                ⏱ Durée estimée : 5-15 minutes (~48 appels IA)
              </p>
            </div>
          )}

        {reportsInProgress && (
          <div className="mt-4 flex items-center gap-2 text-sm text-terracotta">
            <Loader2 className="h-4 w-4 animate-spin" />
            Génération des rapports en cours...
          </div>
        )}

        {reportsComplete && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700">
              6 rapports générés avec succès — Prêt pour le cockpit
            </span>
          </div>
        )}
      </PhaseSection>

      {/* ─── Phase 4: Cockpit ─── */}
      <PhaseSection
        phase="cockpit"
        currentPhase={currentPhase}
        title="Phase 4 : Cockpit stratégique"
        description="Interface interactive + lien de partage public"
      >
        {currentPhase === "cockpit" || currentPhase === "complete" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Le cockpit compile toutes les données en une interface interactive
              premium, prête à être partagée avec le client.
            </p>
            <Button
              onClick={() =>
                router.push(`/strategy/${strategyId}/cockpit`)
              }
              className="bg-terracotta hover:bg-terracotta/90"
            >
              <Eye className="mr-2 h-4 w-4" />
              Ouvrir le Cockpit
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Le cockpit sera disponible après la génération des rapports.
          </p>
        )}
      </PhaseSection>

      {/* ─── Actions footer ─── */}
      <div className="flex items-center justify-between border-t pt-6">
        <Button
          variant="outline"
          onClick={() => router.push(`/strategy/${strategyId}`)}
        >
          Retour à la stratégie
        </Button>

        {currentPhase === "complete" && (
          <Button
            onClick={() =>
              router.push(`/strategy/${strategyId}/cockpit`)
            }
            className="bg-terracotta hover:bg-terracotta/90"
          >
            Voir le cockpit final
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Preview overlay */}
      {previewContent && (
        <PreviewOverlay
          title={previewContent.title}
          content={previewContent.content}
          onClose={() => setPreviewContent(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase Section wrapper
// ---------------------------------------------------------------------------

function PhaseSection({
  phase,
  currentPhase,
  title,
  description,
  children,
}: {
  phase: Phase;
  currentPhase: Phase;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const phases: Phase[] = [
    "fiche",
    "audit",
    "implementation",
    "cockpit",
    "complete",
  ];
  const currentIndex = phases.indexOf(currentPhase);
  const phaseIndex = phases.indexOf(phase);
  const isLocked = phaseIndex > currentIndex;
  const isComplete = phaseIndex < currentIndex;

  return (
    <Card
      className={
        isLocked ? "opacity-50" : isComplete ? "border-green-200/50" : ""
      }
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {isComplete && (
            <Badge
              variant="outline"
              className="border-green-200 bg-green-50 text-green-700"
            >
              <Check className="mr-1 h-3 w-3" />
              Terminé
            </Badge>
          )}
          {isLocked && (
            <Badge variant="outline" className="text-muted-foreground">
              🔒 Verrouillé
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>{isLocked ? null : children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pillar Status Card (compact)
// ---------------------------------------------------------------------------

function PillarStatusCard({
  pillar,
  config,
  onPreview,
  onRetry,
}: {
  pillar: PillarState;
  config: { title: string; color: string; description: string };
  onPreview?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
        pillar.status === "complete"
          ? "border-green-200 bg-green-50/50"
          : pillar.status === "generating"
            ? "border-terracotta/30 bg-terracotta/5 animate-pulse"
            : pillar.status === "error"
              ? "border-red-200 bg-red-50/50"
              : "border-muted"
      }`}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
        style={{ backgroundColor: config.color }}
      >
        {pillar.type}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{config.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {pillar.status === "complete"
            ? "Généré"
            : pillar.status === "generating"
              ? "En cours..."
              : pillar.status === "error"
                ? pillar.errorMessage ?? "Erreur"
                : "En attente"}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {pillar.status === "complete" && (
          <>
            <Check className="h-4 w-4 text-green-600" />
            {onPreview && (
              <button
                onClick={onPreview}
                className="ml-1 rounded p-1 hover:bg-green-100"
              >
                <Eye className="h-3.5 w-3.5 text-green-600" />
              </button>
            )}
          </>
        )}
        {pillar.status === "generating" && (
          <Loader2 className="h-4 w-4 animate-spin text-terracotta" />
        )}
        {pillar.status === "error" && (
          <>
            <X className="h-4 w-4 text-red-500" />
            {onRetry && (
              <button
                onClick={onRetry}
                className="ml-1 rounded p-1 hover:bg-red-100"
              >
                <RotateCcw className="h-3.5 w-3.5 text-red-500" />
              </button>
            )}
          </>
        )}
        {pillar.status === "pending" && (
          <CircleDashed className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview Overlay
// ---------------------------------------------------------------------------

function PreviewOverlay({
  title,
  content,
  onClose,
}: {
  title: string;
  content: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="flex max-h-[80vh] w-full max-w-3xl flex-col">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-[60vh]">
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {content}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

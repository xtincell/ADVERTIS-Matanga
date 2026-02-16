// ADVERTIS Report Generation API Route
// POST /api/ai/reports
// Generates all 8-pillar reports (Phase 3 — Implementation).
// Long-running process: generates section-by-section and saves progress incrementally.

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  generateReport,
  type ReportContext,
} from "~/server/services/report-generation";
import {
  REPORT_TYPES,
  REPORT_CONFIG,
  PILLAR_CONFIG,
} from "~/lib/constants";
import type { ReportType, PillarType } from "~/lib/constants";
import { calculateCoherenceScore } from "~/server/services/coherence-calculator";
import { checkRateLimit, RATE_LIMITS } from "~/lib/rate-limit";

export const maxDuration = 300; // 5 minutes max (Vercel)

export async function POST(req: NextRequest) {
  // ---------------------------------------------------------------------------
  // 1. Auth check
  // ---------------------------------------------------------------------------
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ---------------------------------------------------------------------------
  // 1b. Rate limit check
  // ---------------------------------------------------------------------------
  const rateLimit = checkRateLimit(
    `ai-reports:${session.user.id}`,
    RATE_LIMITS.reportGeneration,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes de génération. Veuillez patienter." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
          ),
        },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Parse and validate body
  // ---------------------------------------------------------------------------
  let body: { strategyId: string; reportType?: string };
  try {
    body = (await req.json()) as { strategyId: string; reportType?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { strategyId, reportType } = body;

  if (!strategyId) {
    return NextResponse.json(
      { error: "strategyId is required" },
      { status: 400 },
    );
  }

  // If reportType is provided, validate it
  if (
    reportType &&
    !REPORT_TYPES.includes(reportType as (typeof REPORT_TYPES)[number])
  ) {
    return NextResponse.json(
      { error: `Invalid reportType: ${reportType}` },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Fetch strategy and verify ownership
  // ---------------------------------------------------------------------------
  const strategy = await db.strategy.findUnique({
    where: { id: strategyId },
    include: {
      pillars: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!strategy || strategy.userId !== session.user.id) {
    return NextResponse.json(
      { error: "Strategy not found" },
      { status: 404 },
    );
  }

  // Verify strategy has completed audit phase (R+T done) before generating reports
  const auditComplete = strategy.pillars
    .filter((p) => ["R", "T"].includes(p.type))
    .every((p) => p.status === "complete");

  if (!auditComplete) {
    return NextResponse.json(
      {
        error: `Les piliers R (Risk) et T (Track) doivent être complétés avant de générer les rapports.`,
      },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Build context from all pillars
  // ---------------------------------------------------------------------------
  const interviewData =
    (strategy.interviewData as Record<string, string>) ?? {};

  const pillarContents = strategy.pillars
    .filter((p) => p.status === "complete")
    .map((p) => ({
      type: p.type,
      title: PILLAR_CONFIG[p.type as PillarType]?.title ?? p.type,
      content:
        typeof p.content === "string"
          ? p.content
          : JSON.stringify(p.content ?? ""),
    }));

  const context: ReportContext = {
    brandName: strategy.brandName,
    sector: strategy.sector ?? "",
    interviewData,
    pillarContents,
  };

  // ---------------------------------------------------------------------------
  // 5. Determine which reports to generate
  // ---------------------------------------------------------------------------
  const typesToGenerate: ReportType[] = reportType
    ? [reportType as ReportType]
    : [...REPORT_TYPES];

  // ---------------------------------------------------------------------------
  // 6. Generate reports
  // ---------------------------------------------------------------------------
  try {
    // Mark strategy as generating
    await db.strategy.update({
      where: { id: strategyId },
      data: { status: "generating" },
    });

    const results = [];

    for (let i = 0; i < typesToGenerate.length; i++) {
      const rt = typesToGenerate[i]!;
      const config = REPORT_CONFIG[rt];

      // Create or update document record — use a single variable for the doc ID
      const existingDoc = await db.document.findUnique({
        where: { strategyId_type: { strategyId, type: rt } },
      });

      let currentDocId: string;

      if (existingDoc) {
        await db.document.update({
          where: { id: existingDoc.id },
          data: {
            status: "generating",
            errorMessage: null,
          },
        });
        currentDocId = existingDoc.id;
      } else {
        const newDoc = await db.document.create({
          data: {
            type: rt,
            title: config.title,
            status: "generating",
            strategyId,
          },
        });
        currentDocId = newDoc.id;
      }

      // Generate report section by section
      const result = await generateReport(
        rt,
        context,
        async (_progress) => {
          // Progress callback — incremental saves could be added here
        },
      );

      // Save completed report
      await db.document.update({
        where: { id: currentDocId },
        data: {
          status: result.status,
          sections: JSON.parse(JSON.stringify(result.sections)),
          content: JSON.parse(JSON.stringify(result)),
          pageCount: result.pageCount,
          generatedAt: new Date(),
          errorMessage: result.errorMessage ?? null,
        },
      });

      results.push({
        type: result.type,
        title: result.title,
        pageCount: result.pageCount,
        totalWordCount: result.totalWordCount,
        sectionCount: result.sections.length,
        status: result.status,
      });
    }

    // Mark pillar I as complete and advance phase
    const pillarI = strategy.pillars.find((p) => p.type === "I");
    if (pillarI) {
      const totalPages = results.reduce((sum, r) => sum + r.pageCount, 0);
      const totalWords = results.reduce(
        (sum, r) => sum + r.totalWordCount,
        0,
      );

      await db.pillar.update({
        where: { id: pillarI.id },
        data: {
          status: "complete",
          generatedAt: new Date(),
          summary: `${results.length} rapports générés — ${totalPages} pages — ${totalWords.toLocaleString()} mots`,
          content: JSON.parse(JSON.stringify({ reports: results })),
        },
      });
    }

    // Recalculate coherence score after generation
    const updatedPillars = await db.pillar.findMany({
      where: { strategyId },
      select: { type: true, status: true, content: true },
    });
    const coherenceScore = calculateCoherenceScore(
      updatedPillars,
      strategy.interviewData as Record<string, unknown> | undefined,
    );

    // Advance to cockpit phase
    await db.strategy.update({
      where: { id: strategyId },
      data: {
        phase: "cockpit",
        status: "complete",
        coherenceScore,
      },
    });

    return NextResponse.json({
      success: true,
      reports: results,
      coherenceScore,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during report generation";

    // Reset strategy status to draft on error (not stuck in "generating")
    await db.strategy.update({
      where: { id: strategyId },
      data: { status: "draft" },
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}

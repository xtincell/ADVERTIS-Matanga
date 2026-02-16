// POST /api/import
// Handles file upload (Excel/Word/PDF), parses text, and maps to ADVERTIS A-E variables via AI.

import { NextResponse } from "next/server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { parseFile } from "~/server/services/file-parser";
import { mapTextToVariables } from "~/server/services/variable-mapper";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ACCEPTED_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "application/pdf", // .pdf
]);

export async function POST(request: Request) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 },
      );
    }

    // 2. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const strategyId = formData.get("strategyId") as string | null;
    const brandName = formData.get("brandName") as string | null;
    const sector = formData.get("sector") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 },
      );
    }

    if (!strategyId) {
      return NextResponse.json(
        { error: "ID de stratégie requis" },
        { status: 400 },
      );
    }

    // 3. Validate file
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Le fichier dépasse la taille maximale de 10 Mo" },
        { status: 400 },
      );
    }

    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error:
            "Format de fichier non supporté. Formats acceptés : .xlsx, .docx, .pdf",
        },
        { status: 400 },
      );
    }

    // 4. Verify strategy ownership
    const strategy = await db.strategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy || strategy.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Stratégie non trouvée" },
        { status: 404 },
      );
    }

    // 5. Create ImportedFile record
    const importedFile = await db.importedFile.create({
      data: {
        fileName: file.name,
        fileType: file.name.split(".").pop()?.toLowerCase() ?? "unknown",
        fileSize: file.size,
        status: "parsing",
        strategyId,
      },
    });

    // 6. Parse the file
    const buffer = Buffer.from(await file.arrayBuffer());
    let parseResult;
    try {
      parseResult = await parseFile(buffer, file.name);
    } catch (error) {
      await db.importedFile.update({
        where: { id: importedFile.id },
        data: {
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Erreur lors de l'extraction du texte",
        },
      });
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Erreur lors de l'extraction du texte",
        },
        { status: 422 },
      );
    }

    // Save extracted text
    await db.importedFile.update({
      where: { id: importedFile.id },
      data: {
        extractedText: parseResult.text,
      },
    });

    // 7. Map text to variables via AI
    let mappingResult;
    try {
      mappingResult = await mapTextToVariables(
        parseResult.text,
        brandName ?? strategy.brandName,
        sector ?? strategy.sector ?? "",
      );
    } catch (error) {
      await db.importedFile.update({
        where: { id: importedFile.id },
        data: {
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Erreur lors du mapping IA",
        },
      });
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Erreur lors du mapping IA des variables",
        },
        { status: 500 },
      );
    }

    // 8. Update ImportedFile with mapping results
    await db.importedFile.update({
      where: { id: importedFile.id },
      data: {
        mappedData: mappingResult.mappedVariables,
        status: "mapped",
      },
    });

    // 9. Return results
    return NextResponse.json({
      importedFileId: importedFile.id,
      fileName: file.name,
      metadata: parseResult.metadata,
      mappedVariables: mappingResult.mappedVariables,
      confidence: mappingResult.confidence,
      unmappedVariables: mappingResult.unmappedVariables,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Erreur interne lors de l'import" },
      { status: 500 },
    );
  }
}

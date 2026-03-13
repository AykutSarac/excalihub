import { jsonrepair } from "jsonrepair";
import { GENERATE_SYSTEM_PROMPT, CONTINUE_SYSTEM_PROMPT } from "./data/prompts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const API_KEY_STORAGE = "excalihub_anthropic_key";

function centerBoundText(elements: CanvasElement[]): void {
  const byId = new Map(elements.map((el) => [el.id, el]));
  for (const el of elements) {
    if (el.type === "text" && el.containerId && el.verticalAlign === "middle") {
      const container = byId.get(el.containerId);
      if (container) {
        el.y = container.y + (container.height - el.height) / 2;
        el.x = container.x + (container.width - el.width) / 2;
      }
    }
  }
}

export async function getApiKey(): Promise<string> {
  const result = await chrome.storage.local.get(API_KEY_STORAGE);
  return (result[API_KEY_STORAGE] as string) || "";
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE]: key });
}

interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  containerId?: string | null;
  verticalAlign?: string;
  boundElements?: Array<{ id: string; type: string }> | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  connectToExisting?: string[];
  [key: string]: unknown;
}

function extractTextFromResponse(data: Record<string, unknown>): string {
  const content = data.content as Array<{ text?: string }> | undefined;
  if (!content?.length || !content[0].text) {
    throw new Error("Unexpected API response: no text content returned");
  }
  return content[0].text;
}

export interface CanvasSummary {
  shapes: Array<{ id: string; type: string; label: string; cx: number; cy: number }>;
  arrows: Array<{ id: string; from: string; to: string }>;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  elements: CanvasElement[];
}

export function summarizeCanvas(elementsRaw: string): CanvasSummary | null {
  let elements: CanvasElement[];
  try {
    elements = JSON.parse(elementsRaw);
    if (!Array.isArray(elements)) return null;
  } catch {
    return null;
  }

  // Filter out deleted elements
  elements = elements.filter((el) => !el.isDeleted);
  if (elements.length === 0) return null;

  // Build text lookup: containerId -> text
  const textByContainer = new Map<string, string>();
  for (const el of elements) {
    if (el.type === "text" && el.containerId) {
      textByContainer.set(el.containerId, (el.text as string) || "");
    }
  }

  const shapes: CanvasSummary["shapes"] = [];
  const arrows: CanvasSummary["arrows"] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of elements) {
    // Update bounding box
    const x2 = el.x + (el.width || 0);
    const y2 = el.y + (el.height || 0);
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;

    if (["rectangle", "ellipse", "diamond"].includes(el.type)) {
      shapes.push({
        id: el.id,
        type: el.type,
        label: textByContainer.get(el.id) || "",
        cx: Math.round(el.x + (el.width || 0) / 2),
        cy: Math.round(el.y + (el.height || 0) / 2),
      });
    } else if (el.type === "arrow") {
      arrows.push({
        id: el.id,
        from: el.startBinding?.elementId || "none",
        to: el.endBinding?.elementId || "none",
      });
    }
  }

  return {
    shapes,
    arrows,
    bbox: { minX: Math.round(minX), minY: Math.round(minY), maxX: Math.round(maxX), maxY: Math.round(maxY) },
    elements,
  };
}

export async function generateContinuation(prompt: string, summary: CanvasSummary): Promise<CanvasElement[]> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("API key not configured. Click the settings icon to add your Anthropic API key.");

  // Build a concise description of the existing canvas
  const shapeDescs = summary.shapes.map((s) =>
    `- ${s.type} id="${s.id}" label="${s.label}" at (${s.cx}, ${s.cy})`
  ).join("\n");
  const arrowDescs = summary.arrows.map((a) => `- arrow id="${a.id}" from="${a.from}" to="${a.to}"`).join("\n");
  const contextMsg = `EXISTING CANVAS:
Bounding box: (${summary.bbox.minX}, ${summary.bbox.minY}) to (${summary.bbox.maxX}, ${summary.bbox.maxY})

Shapes:
${shapeDescs || "(none)"}

Connections:
${arrowDescs || "(none)"}

USER REQUEST: ${prompt}`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: CONTINUE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: contextMsg }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) throw new Error("Invalid API key. Check your key in settings.");
    throw new Error(`API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  let text: string = extractTextFromResponse(data);

  text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  text = jsonrepair(text);

  const parsed = JSON.parse(text);
  const newElements: CanvasElement[] = Array.isArray(parsed) ? parsed : parsed.elements || [];

  if (newElements.length === 0) {
    throw new Error("AI did not return any new elements");
  }

  centerBoundText(newElements);
  return newElements;
}

export async function generateDrawing(prompt: string): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("API key not configured. Click the settings icon to add your Anthropic API key.");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: GENERATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) throw new Error("Invalid API key. Check your key in settings.");
    throw new Error(`API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  let text: string = extractTextFromResponse(data);

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();

  // Repair malformed JSON (control chars, trailing commas, comments, etc.)
  text = jsonrepair(text);

  const parsed = JSON.parse(text);
  if (!parsed.elements || !Array.isArray(parsed.elements)) {
    throw new Error("AI response was not valid Excalidraw JSON");
  }

  centerBoundText(parsed.elements);

  // Return the re-serialized JSON to ensure it's clean
  return JSON.stringify(parsed, null, 2);
}

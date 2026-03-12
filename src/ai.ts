import { jsonrepair } from "jsonrepair";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const API_KEY_STORAGE = "excalihub_anthropic_key";

const SYSTEM_PROMPT = `You are an Excalidraw drawing generator. Given a description, produce a valid Excalidraw JSON file.

Return ONLY raw JSON — no markdown, no code fences, no explanation.

The JSON must follow this structure:
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": { "viewBackgroundColor": "#ffffff" },
  "files": {}
}

Each element must include ALL of these common fields:
- "id": unique string (e.g. "rect_1", "text_1", "arrow_1")
- "type": one of "rectangle", "ellipse", "diamond", "arrow", "line", "text"
- "x", "y": number (position)
- "width", "height": number (size; use 0 for arrows/lines)
- "angle": 0
- "strokeColor": "#1e1e1e"
- "backgroundColor": "transparent" (or "#a5d8ff", "#b2f2bb", "#ffec99", "#ffc9c9")
- "fillStyle": "solid"
- "strokeWidth": 2
- "strokeStyle": "solid"
- "roughness": 1
- "opacity": 100
- "groupIds": []
- "frameId": null
- "index": "a0" (increment: "a1", "a2", etc.)
- "roundness": { "type": 3 } (use { "type": 2 } for ellipse)
- "seed": unique random integer
- "version": 1
- "versionNonce": unique random integer
- "isDeleted": false
- "updated": 1700000000000
- "link": null
- "locked": false

CRITICAL — Bound text inside containers:
When a shape (rectangle, ellipse, diamond) has a text label, you MUST create TWO elements with a bidirectional binding:
1. The container shape must list the text in its "boundElements" array.
2. The text element must set "containerId" to the container's id.

Example — a labeled rectangle:
{
  "id": "rect_1",
  "type": "rectangle",
  "x": 100, "y": 100, "width": 220, "height": 100,
  "boundElements": [{ "id": "text_1", "type": "text" }],
  ... (other common fields)
},
{
  "id": "text_1",
  "type": "text",
  "x": 105, "y": 137, "width": 210, "height": 25,
  "text": "My Label",
  "originalText": "My Label",
  "fontSize": 20,
  "fontFamily": 5,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "rect_1",
  "autoResize": true,
  "lineHeight": 1.25,
  "boundElements": null,
  ... (other common fields)
}

Both sides of the binding are required — if either is missing, the text will float outside the shape.

Arrows and connections:
For "arrow" and "line" elements, also include:
- "points": [[0, 0], [dx, dy]] (offset from start to end)
- "lastCommittedPoint": null
- "startArrowhead": null
- "endArrowhead": "arrow" (for arrows) or null (for lines)
- "startBinding": { "elementId": "source_id", "focus": 0, "gap": 1, "fixedPoint": null } or null
- "endBinding": { "elementId": "target_id", "focus": 0, "gap": 1, "fixedPoint": null } or null
- "boundElements": null

When an arrow connects to a shape, the binding must be bidirectional:
- The arrow's startBinding/endBinding must reference the shape's id.
- The shape's boundElements array must include { "id": "arrow_id", "type": "arrow" }.
A shape can have BOTH a text binding and arrow bindings in its boundElements array, e.g.:
"boundElements": [{ "id": "text_1", "type": "text" }, { "id": "arrow_1", "type": "arrow" }]

Standalone text (no container):
Only use standalone text (containerId: null) for titles or freestanding annotations — NOT for labels inside shapes.

Layout guidelines:
- Space elements with at least 60px gap between shapes
- Use logical layout: flowcharts go top-to-bottom or left-to-right
- Center the drawing around coordinates (200, 200)
- Make shapes large enough for their text (rectangles: ~220x100, ellipses: ~200x100)
- fontSize: 20

IMPORTANT: Return ONLY the JSON object. No other text.`;

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

const CONTINUE_SYSTEM_PROMPT = `You are an Excalidraw drawing extender. The user has an EXISTING drawing and wants to add more elements to it.

You will receive:
1. A summary of what already exists on the canvas (shapes, labels, positions, connections, bounding box)
2. The user's request for what to add

Return ONLY a JSON array of NEW elements to add — not a full Excalidraw file. Example: [{ ... }, { ... }]

RULES:
- Do NOT recreate or duplicate any existing elements.
- Use unique IDs that don't conflict with existing ones (prefix with "new_").
- Position new elements OUTSIDE the existing bounding box so they don't overlap. Place them to the right or below existing content.
- If the user wants to connect new elements to existing ones, use arrows with startBinding/endBinding referencing the EXISTING element IDs. Also reference the new arrow ID in the existing shape by including a special "patchBindings" note (see below).
- Follow all the same Excalidraw element rules as before (bound text, bidirectional bindings, etc.).

${SYSTEM_PROMPT.split("Each element must include ALL")[1] ? "Element field rules:\n" + SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("Each element must include ALL")) : ""}

When connecting a new arrow to an EXISTING shape, you cannot modify the existing shape's boundElements directly. Instead, add an extra top-level field to the arrow: "connectToExisting": ["existing_element_id1", "existing_element_id2"] — list the IDs of existing shapes this arrow connects to. The application will patch the bindings.

IMPORTANT: Return ONLY a JSON array [...] of new elements. No wrapping object, no markdown.`;

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
  [key: string]: unknown;
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
      model: "claude-sonnet-4-20250514",
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
  let text: string = data.content[0].text;

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
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) throw new Error("Invalid API key. Check your key in settings.");
    throw new Error(`API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  let text: string = data.content[0].text;

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

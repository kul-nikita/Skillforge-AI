"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Info, X, ExternalLink } from "lucide-react";
import type { Skill, MasteryMap } from "@/lib/types";
import type { LearningResource } from "@/lib/types";

type GraphNode = {
  data: {
    id: string;
    label: string;
    mastery: number;
    category: string;
    description: string;
    resourceCount: number;
    isRequired: boolean;
  };
};

type GraphEdge = {
  data: { source: string; target: string };
};

type SkillGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  skills: Skill[];
  mastery: MasteryMap;
  resources: LearningResource[];
  requiredSkillIds: string[];
};

const MASTERY_COLORS: Record<string, string> = {
  zero: "#ef4444",       // red - 0%
  low: "#f97316",        // orange - 1-30%
  mid: "#eab308",        // yellow - 31-60%
  high: "#84cc16",       // lime - 61-79%
  mastered: "#22c55e"    // green - 80%+
};

function getMasteryColor(mastery: number): string {
  if (mastery <= 0) return MASTERY_COLORS.zero;
  if (mastery <= 0.3) return MASTERY_COLORS.low;
  if (mastery <= 0.6) return MASTERY_COLORS.mid;
  if (mastery < 0.8) return MASTERY_COLORS.high;
  return MASTERY_COLORS.mastered;
}

export function SkillGraphExplorer({ data }: { data: SkillGraphData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedResources, setSelectedResources] = useState<LearningResource[]>([]);

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    // Cytoscape touches the DOM, so it can only load in the browser.
    import("cytoscape").then((cytoscapeModule) => {
      const cytoscape = cytoscapeModule.default;

      const elements = [
        ...data.nodes.map((node) => ({
          data: node.data,
          position: { x: 0, y: 0 }
        })),
        ...data.edges.map((edge) => ({
          data: edge.data
        }))
      ];

      const cy = cytoscape({
        container: containerRef.current!,
        elements,
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              "background-color": (ele: any) =>
                getMasteryColor(ele.data("mastery")),
              color: "#1f2937",
              "text-valign": "center",
              "text-halign": "center",
              "font-size": "11px",
              width: (ele: any) =>
                ele.data("isRequired") ? 50 : 40,
              height: (ele: any) =>
                ele.data("isRequired") ? 50 : 40,
              "border-width": (ele: any) =>
                ele.data("isRequired") ? 3 : 1,
              "border-color": "#64748b",
              "text-wrap": "wrap",
              "text-max-width": "80px"
            }
          },
          {
            selector: "edge",
            style: {
              width: 2,
              "line-color": "#9ca3af",
              "target-arrow-color": "#9ca3af",
              "target-arrow-shape": "triangle",
              "arrow-scale": 0.8,
              "curve-style": "bezier"
            }
          },
          {
            selector: "node:selected",
            style: {
              "border-width": 4,
              "border-color": "#6366f1",
              "background-color": "#6366f1",
              color: "white"
            }
          },
          {
            selector: ".highlighted",
            style: {
              "background-color": "#fbbf24",
              "border-color": "#f59e0b"
            }
          }
        ],
        layout: {
          name: "breadthfirst",
          directed: true,
          spacingFactor: 1.2,
          animate: false,
          padding: 50
        } as cytoscape.LayoutOptions,
        minZoom: 0.3,
        maxZoom: 3,
        wheelSensitivity: 0.2
      });

      cyRef.current = cy;

      cy.on("tap", "node", (evt) => {
        const node = evt.target;
        const skillId = node.data("id");
        const skill = data.skills.find((s) => s.id === skillId);
        setSelectedSkill(skill ?? null);

        const resources = data.resources.filter((r) => r.skillTags.includes(skillId));
        setSelectedResources(resources);
      });

      cy.on("mouseover", "node", (evt) => {
        const node = evt.target;
        node.connectedEdges().addClass("highlighted");
        node.predecessors().addClass("highlighted");
      });

      cy.on("mouseout", "node", (evt) => {
        const node = evt.target;
        node.connectedEdges().removeClass("highlighted");
        node.predecessors().removeClass("highlighted");
      });
    });

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [data]);

  function zoomIn() {
    cyRef.current?.zoom({ level: cyRef.current.zoom() * 1.3, renderedPosition: { x: 0, y: 0 } });
  }

  function zoomOut() {
    cyRef.current?.zoom({ level: cyRef.current.zoom() / 1.3, renderedPosition: { x: 0, y: 0 } });
  }

  function fitToView() {
    cyRef.current?.fit(undefined, 50);
  }

  return (
    <div className="relative">
      {/* Graph Container */}
      <div className="relative rounded-lg border border-border bg-surface">
        {/* Controls */}
        <div className="absolute right-3 top-3 z-10 flex gap-1">
          <button
            onClick={zoomIn}
            type="button"
            className="rounded-md border border-border bg-surface p-2 text-ink hover:bg-canvas"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={zoomOut}
            type="button"
            className="rounded-md border border-border bg-surface p-2 text-ink hover:bg-canvas"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={fitToView}
            type="button"
            className="rounded-md border border-border bg-surface p-2 text-ink hover:bg-canvas"
            title="Fit to view"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute left-3 top-3 z-10 rounded-md border border-border bg-surface p-3 text-xs text-muted">
          <div className="font-medium text-ink">Mastery</div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: MASTERY_COLORS.mastered }} />
              <span>80%+ (Mastered)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: MASTERY_COLORS.high }} />
              <span>61-79%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: MASTERY_COLORS.mid }} />
              <span>31-60%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: MASTERY_COLORS.low }} />
              <span>1-30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: MASTERY_COLORS.zero }} />
              <span>0% (Not started)</span>
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-gray-700 bg-gray-500" />
              <span>Required skill</span>
            </div>
          </div>
        </div>

        {/* Graph */}
        <div
          ref={containerRef}
          className="h-[600px] w-full"
        />

        {/* Instructions */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
          <Info size={14} />
          Click a node to see details. Hover to highlight prerequisites.
        </div>
      </div>

      {/* Skill Detail Panel */}
      {selectedSkill && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: getMasteryColor(data.mastery[selectedSkill.id] ?? 0) }}
                />
                <h3 className="text-xl font-semibold text-ink">{selectedSkill.name}</h3>
              </div>
              <p className="mt-2 text-sm text-muted">{selectedSkill.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-ink">
                  {selectedSkill.category}
                </span>
                <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-ink">
                  {Math.round((data.mastery[selectedSkill.id] ?? 0) * 100)}% mastery
                </span>
                {data.requiredSkillIds.includes(selectedSkill.id) && (
                  <span className="rounded-full bg-teal/10 px-3 py-1 text-xs font-medium text-teal">
                    Required
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedSkill(null)}
              type="button"
              className="rounded-md p-1 text-muted hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>

          {/* Prerequisites */}
          {selectedSkill.prerequisites.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted">Prerequisites</h4>
              <ul className="mt-2 space-y-1">
                {selectedSkill.prerequisites.map((prereqId) => {
                  const prereq = data.skills.find((s) => s.id === prereqId);
                  const m = data.mastery[prereqId] ?? 0;
                  return (
                    <li className="flex items-center gap-2 text-sm" key={prereqId}>
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: getMasteryColor(m) }}
                      />
                      <span className="text-ink">{prereq?.name ?? prereqId}</span>
                      <span className="text-muted">({Math.round(m * 100)}%)</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Resources */}
          {selectedResources.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
                Learning Resources ({selectedResources.length})
              </h4>
              <ul className="mt-2 space-y-2">
                {selectedResources.slice(0, 5).map((resource) => (
                  <li
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                    key={resource.id}
                  >
                    <div>
                      <div className="font-medium text-ink">{resource.title}</div>
                      <div className="text-xs text-muted">
                        {resource.provider} · {resource.resourceType} ·{" "}
                        {resource.durationMinutes}min · {resource.costType}
                      </div>
                    </div>
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-md border border-border p-2 text-muted hover:bg-canvas"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </li>
                ))}
              </ul>
              {selectedResources.length > 5 && (
                <p className="mt-2 text-xs text-muted">
                  + {selectedResources.length - 5} more resources
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

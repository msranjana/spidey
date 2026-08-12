/**
 * OrchestrationGraph.tsx
 *
 * SVG-based directed-graph showing the Spider-Sense investigation pipeline:
 *
 *   Orchestrator ──► [Log Scout, Code Hunter, Infra Scout, Security Scout]
 *                    (parallel fan-out)
 *                          │
 *                          ▼ (fan-in)
 *                     Root Cause ──► Fix Agent ──► Verification
 *
 * Status transitions (backend stub pipeline):
 *   ''        → all IDLE
 *   PENDING   → orchestrator IDLE, scouts IDLE
 *   RUNNING   → orchestrator RUNNING, scouts RUNNING/COMPLETE as events arrive
 *   root_cause→ scouts COMPLETE, root_cause RUNNING
 *   fix_proposed → root_cause COMPLETE, fix_agent RUNNING; verification IDLE→RUNNING
 *   COMPLETE  → everything COMPLETE
 */

import './OrchestrationGraph.css';
import { AgentStatus } from '../types';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface OrchestrationGraphProps {
  agentStates: Record<string, AgentStatus>;
  investigationStatus: string;
}

// ─────────────────────────────────────────────
// Layout constants
// SVG viewport: 860 × 340 — extra room for labels below bottom scout
// ─────────────────────────────────────────────

const W  = 860;
const H  = 340;
const R  = 26;   // node circle radius
const LY = 18;   // stage-label y

type NodeId =
  | 'orchestrator'
  | 'log_scout'
  | 'code_hunter'
  | 'infra_scout'
  | 'security_scout'
  | 'root_cause'
  | 'fix_agent'
  | 'verification';

interface NodeDef {
  id: NodeId;
  label: string;
  /** Agent name key as sent by backend in SSE `agent_update.agent` field */
  agentKey: string | null;
  cx: number;
  cy: number;
}

// Scouts are spaced 70px apart, centred vertically at y=160
// (top scout at 160-3*35=55, bottom scout at 160+3*35=265)
const SCOUT_CY = [70, 135, 200, 265] as const;

const NODES: NodeDef[] = [
  { id: 'orchestrator',   label: 'Orchestrator',   agentKey: null,             cx: 90,  cy: 167 },
  { id: 'log_scout',      label: 'Log Scout',       agentKey: 'Log Scout',      cx: 260, cy: SCOUT_CY[0] },
  { id: 'code_hunter',    label: 'Code Hunter',     agentKey: 'Code Hunter',    cx: 260, cy: SCOUT_CY[1] },
  { id: 'infra_scout',    label: 'Infra Scout',     agentKey: 'Infra Scout',    cx: 260, cy: SCOUT_CY[2] },
  { id: 'security_scout', label: 'Security Scout',  agentKey: 'Security Scout', cx: 260, cy: SCOUT_CY[3] },
  { id: 'root_cause',     label: 'Root Cause',      agentKey: null,             cx: 450, cy: 167 },
  { id: 'fix_agent',      label: 'Fix Agent',       agentKey: null,             cx: 620, cy: 167 },
  { id: 'verification',   label: 'Verification',    agentKey: null,             cx: 780, cy: 167 },
];

interface EdgeDef {
  from: NodeId;
  to: NodeId;
}

const EDGES: EdgeDef[] = [
  // Fan-out: orchestrator → scouts
  { from: 'orchestrator',   to: 'log_scout'      },
  { from: 'orchestrator',   to: 'code_hunter'    },
  { from: 'orchestrator',   to: 'infra_scout'    },
  { from: 'orchestrator',   to: 'security_scout' },
  // Fan-in: scouts → root cause
  { from: 'log_scout',      to: 'root_cause'     },
  { from: 'code_hunter',    to: 'root_cause'     },
  { from: 'infra_scout',    to: 'root_cause'     },
  { from: 'security_scout', to: 'root_cause'     },
  // Linear pipeline
  { from: 'root_cause',     to: 'fix_agent'      },
  { from: 'fix_agent',      to: 'verification'   },
];

// ─────────────────────────────────────────────
// Color palette
// ─────────────────────────────────────────────

const STATUS_COLOR: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]:     '#374151',
  [AgentStatus.RUNNING]:  '#f59e0b',
  [AgentStatus.COMPLETE]: '#22c55e',
  [AgentStatus.FAILED]:   '#ef4444',
};

const STATUS_GLOW: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]:     'transparent',
  [AgentStatus.RUNNING]:  '#f59e0b',
  [AgentStatus.COMPLETE]: 'transparent',
  [AgentStatus.FAILED]:   '#ef4444',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function nodeById(id: NodeId): NodeDef {
  return NODES.find(n => n.id === id)!;
}

/**
 * Shorten a line so the arrowhead tip sits at the target node's circle edge.
 * Returns [x1, y1, x2_shortened, y2_shortened].
 */
function shortenLine(
  x1: number, y1: number,
  x2: number, y2: number,
  margin: number,
): [number, number, number, number] {
  const dx  = x2 - x1;
  const dy  = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [x1, y1, x2, y2];
  const ratio = (len - margin) / len;
  return [x1, y1, x1 + dx * ratio, y1 + dy * ratio];
}

/**
 * Edge visual state:
 *  'active'   → target node is RUNNING  (animated purple data flow)
 *  'complete' → target node is COMPLETE (solid green)
 *  'idle'     → otherwise               (dashed grey)
 */
function computeEdgeState(
  edge: EdgeDef,
  getStatus: (id: NodeId) => AgentStatus,
): 'idle' | 'active' | 'complete' {
  const s = getStatus(edge.to);
  if (s === AgentStatus.COMPLETE) return 'complete';
  if (s === AgentStatus.RUNNING)  return 'active';
  return 'idle';
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface NodeProps {
  node: NodeDef;
  status: AgentStatus;
}

function GraphNode({ node, status }: NodeProps) {
  const fill       = STATUS_COLOR[status];
  const glow       = STATUS_GLOW[status];
  const isRunning  = status === AgentStatus.RUNNING;
  const isComplete = status === AgentStatus.COMPLETE;
  const statusLow  = status.toLowerCase();

  // Checkmark geometry — two-segment path inside circle
  const arm  = R * 0.33;
  const ckX  = node.cx - arm * 0.85;
  const ckY  = node.cy;
  const ckMX = node.cx - arm * 0.05;
  const ckMY = node.cy + arm * 0.7;
  const ckEX = node.cx + arm * 1.1;
  const ckEY = node.cy - arm * 0.7;

  return (
    <g className="ograph-node" role="img" aria-label={`${node.label}: ${status}`}>
      {/* Animated pulse ring — only when RUNNING */}
      <circle
        cx={node.cx}
        cy={node.cy}
        r={R + 5}
        className={`ograph-pulse-ring${isRunning ? ' ograph-pulse-ring--active' : ''}`}
        stroke={glow}
      />

      {/* Main circle */}
      <circle
        cx={node.cx}
        cy={node.cy}
        r={R}
        className="ograph-node-circle"
        fill={fill}
        stroke={isRunning ? glow : '#1e293b'}
        strokeWidth={isRunning ? 2.5 : 1.5}
      />

      {/* Checkmark — fades in on COMPLETE */}
      <path
        d={`M ${ckX} ${ckY} L ${ckMX} ${ckMY} L ${ckEX} ${ckEY}`}
        className={`ograph-checkmark${isComplete ? ' ograph-checkmark--visible' : ''}`}
      />

      {/* Label below node */}
      <text
        x={node.cx}
        y={node.cy + R + 15}
        className={`ograph-node-label ograph-node-label--${statusLow}`}
      >
        {node.label}
      </text>
    </g>
  );
}

interface EdgeProps {
  edge: EdgeDef;
  state: 'idle' | 'active' | 'complete';
  markerId: string;
}

function GraphEdge({ edge, state, markerId }: EdgeProps) {
  const src = nodeById(edge.from);
  const dst = nodeById(edge.to);

  const [x1, y1, x2, y2] = shortenLine(
    src.cx, src.cy,
    dst.cx, dst.cy,
    R + 8,
  );

  const cls = [
    'ograph-edge',
    state === 'active'   ? 'ograph-edge--active'   : '',
    state === 'complete' ? 'ograph-edge--complete' : '',
  ].filter(Boolean).join(' ');

  return (
    <line
      x1={x1} y1={y1}
      x2={x2} y2={y2}
      className={cls}
      markerEnd={`url(#${markerId})`}
    />
  );
}

// ─────────────────────────────────────────────
// Status inference helpers
// ─────────────────────────────────────────────

const SCOUT_KEYS = ['Log Scout', 'Code Hunter', 'Infra Scout', 'Security Scout'] as const;

/**
 * Returns true when all 4 scouts have reached a terminal state.
 */
function allScoutsDone(agentStates: Record<string, AgentStatus>): boolean {
  return SCOUT_KEYS.every(
    k => agentStates[k] === AgentStatus.COMPLETE || agentStates[k] === AgentStatus.FAILED,
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function OrchestrationGraph({
  agentStates,
  investigationStatus: invStatus,
}: OrchestrationGraphProps) {

  /**
   * Map each graph node to an AgentStatus.
   *
   * Scout nodes read directly from agentStates (keyed by backend agent name).
   * Pipeline nodes (Orchestrator, Root Cause, Fix Agent, Verification) are
   * inferred from the investigation-level status string.
   *
   * Backend status progression (stub pipeline):
   *   ''          → pre-run, everything IDLE
   *   'PENDING'   → about to start, everything IDLE
   *   'RUNNING'   → scouts running in parallel
   *   'root_cause'→ scouts done, root-cause analysis in progress
   *   'fix_proposed' → root cause done, fix agent ran, verification running
   *   'COMPLETE'  → full pipeline done
   */
  function getNodeStatus(nodeId: NodeId): AgentStatus {
    switch (nodeId) {
      case 'orchestrator':
        if (invStatus === 'COMPLETE')                        return AgentStatus.COMPLETE;
        if (invStatus === '' || invStatus === 'PENDING')     return AgentStatus.IDLE;
        return AgentStatus.RUNNING;

      case 'root_cause':
        // COMPLETE once fix stage begins or pipeline is done
        if (invStatus === 'fix_proposed' || invStatus === 'COMPLETE') return AgentStatus.COMPLETE;
        // RUNNING while backend is in the root-cause phase
        if (invStatus === 'root_cause')                               return AgentStatus.RUNNING;
        // RUNNING if all scouts just finished but root_cause event not yet received
        if (invStatus === 'RUNNING' && allScoutsDone(agentStates))    return AgentStatus.RUNNING;
        return AgentStatus.IDLE;

      case 'fix_agent':
        if (invStatus === 'COMPLETE')                        return AgentStatus.COMPLETE;
        // Fix agent runs while fix_proposed status is active
        // (backend sends fix_proposed *after* the fix is determined, so the node
        //  is RUNNING during root_cause and COMPLETE at fix_proposed)
        if (invStatus === 'fix_proposed')                    return AgentStatus.COMPLETE;
        if (invStatus === 'root_cause')                      return AgentStatus.RUNNING;
        return AgentStatus.IDLE;

      case 'verification':
        if (invStatus === 'COMPLETE')                        return AgentStatus.COMPLETE;
        // Verification is running while fix_proposed is the active phase
        if (invStatus === 'fix_proposed')                    return AgentStatus.RUNNING;
        return AgentStatus.IDLE;

      default: {
        // Scout nodes — resolve from live agentStates
        const node = nodeById(nodeId);
        if (node.agentKey !== null) {
          return agentStates[node.agentKey] ?? AgentStatus.IDLE;
        }
        return AgentStatus.IDLE;
      }
    }
  }

  function getEdgeState(edge: EdgeDef): 'idle' | 'active' | 'complete' {
    return computeEdgeState(edge, getNodeStatus);
  }

  // Stage-label x positions align with node column centers
  const stageLabelX = {
    orchestrator:  90,
    scouts:       260,
    rootCause:    450,
    fix:          620,
    verify:       780,
  };

  return (
    <div className="ograph-wrapper">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ograph-svg"
        aria-label="Spider-Sense agent pipeline graph"
        role="img"
      >
        <defs>
          {/* Arrowhead markers — one per edge state to avoid recoloring */}
          <marker id="arrow-idle"     markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" className="ograph-arrow-idle" />
          </marker>
          <marker id="arrow-active"   markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" className="ograph-arrow-active" />
          </marker>
          <marker id="arrow-complete" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" className="ograph-arrow-complete" />
          </marker>
        </defs>

        {/* Stage column labels */}
        <text x={stageLabelX.orchestrator} y={LY} className="ograph-stage-label">Orchestrator</text>
        <text x={stageLabelX.scouts}       y={LY} className="ograph-stage-label">Parallel Scouts</text>
        <text x={stageLabelX.rootCause}    y={LY} className="ograph-stage-label">Root Cause</text>
        <text x={stageLabelX.fix}          y={LY} className="ograph-stage-label">Fix</text>
        <text x={stageLabelX.verify}       y={LY} className="ograph-stage-label">Verify</text>

        {/* ── Edges (rendered below nodes) ── */}
        {EDGES.map(edge => {
          const state    = getEdgeState(edge);
          const markerId = `arrow-${state}`;
          return (
            <GraphEdge
              key={`${edge.from}→${edge.to}`}
              edge={edge}
              state={state}
              markerId={markerId}
            />
          );
        })}

        {/* ── Nodes ── */}
        {NODES.map(node => (
          <GraphNode
            key={node.id}
            node={node}
            status={getNodeStatus(node.id)}
          />
        ))}
      </svg>
    </div>
  );
}

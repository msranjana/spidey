/**
 * OrchestrationGraph.tsx
 *
 * SVG-based directed-graph showing the Spider-Sense investigation pipeline:
 *
 *   Orchestrator ──► [Log Scout, Code Hunter, Infra Scout, Security Scout]
 *                    (parallel)
 *                          │
 *                          ▼
 *                     Root Cause ──► Fix Agent ──► Verification
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
// Layout constants (SVG viewport: 820 × 300)
// ─────────────────────────────────────────────

const W = 820;
const H = 300;
const R = 26; // node circle radius

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
  /** Agent name as sent by backend (for lookup in agentStates) */
  agentKey: string | null;
  cx: number;
  cy: number;
}

const NODES: NodeDef[] = [
  { id: 'orchestrator',   label: 'Orchestrator',   agentKey: null,             cx: 80,  cy: 150 },
  { id: 'log_scout',      label: 'Log Scout',       agentKey: 'Log Scout',      cx: 240, cy: 60  },
  { id: 'code_hunter',    label: 'Code Hunter',     agentKey: 'Code Hunter',    cx: 240, cy: 130 },
  { id: 'infra_scout',    label: 'Infra Scout',     agentKey: 'Infra Scout',    cx: 240, cy: 200 },
  { id: 'security_scout', label: 'Security Scout',  agentKey: 'Security Scout', cx: 240, cy: 270 },
  { id: 'root_cause',     label: 'Root Cause',      agentKey: 'Root Cause',     cx: 430, cy: 150 },
  { id: 'fix_agent',      label: 'Fix Agent',       agentKey: 'Fix Agent',      cx: 600, cy: 150 },
  { id: 'verification',   label: 'Verification',    agentKey: 'Verification',   cx: 750, cy: 150 },
];

interface EdgeDef {
  from: NodeId;
  to: NodeId;
}

const EDGES: EdgeDef[] = [
  { from: 'orchestrator',   to: 'log_scout'      },
  { from: 'orchestrator',   to: 'code_hunter'    },
  { from: 'orchestrator',   to: 'infra_scout'    },
  { from: 'orchestrator',   to: 'security_scout' },
  { from: 'log_scout',      to: 'root_cause'     },
  { from: 'code_hunter',    to: 'root_cause'     },
  { from: 'infra_scout',    to: 'root_cause'     },
  { from: 'security_scout', to: 'root_cause'     },
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
 * Shorten the line so arrowhead starts at the circle's edge.
 * Returns [x1, y1, x2, y2] shortened by `margin` px from the target end.
 */
function shortenLine(
  x1: number, y1: number,
  x2: number, y2: number,
  margin: number,
): [number, number, number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [x1, y1, x2, y2];
  const ratio = (len - margin) / len;
  return [x1, y1, x1 + dx * ratio, y1 + dy * ratio];
}

/**
 * Determine the visual state of an edge:
 * - 'complete'  : target node is COMPLETE
 * - 'active'    : target node is RUNNING (data flowing toward it)
 * - 'idle'      : otherwise
 */
function edgeState(
  edge: EdgeDef,
  getStatus: (id: NodeId) => AgentStatus,
): 'idle' | 'active' | 'complete' {
  const toStatus = getStatus(edge.to);
  if (toStatus === AgentStatus.COMPLETE) return 'complete';
  if (toStatus === AgentStatus.RUNNING)  return 'active';
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
  const fill   = STATUS_COLOR[status];
  const glow   = STATUS_GLOW[status];
  const isRunning  = status === AgentStatus.RUNNING;
  const isComplete = status === AgentStatus.COMPLETE;

  // checkmark path scaled to circle radius R
  const ck  = R * 0.35;
  const ckX = node.cx - ck * 0.9;
  const ckY = node.cy;
  const ckMX = node.cx - ck * 0.1;
  const ckMY = node.cy + ck * 0.7;
  const ckEX = node.cx + ck * 1.1;
  const ckEY = node.cy - ck * 0.7;

  const statusLabel = status.toLowerCase();

  return (
    <g className="ograph-node" role="img" aria-label={`${node.label}: ${status}`}>
      {/* Pulse ring (visible only when RUNNING) */}
      <circle
        cx={node.cx}
        cy={node.cy}
        r={R + 4}
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
        strokeWidth={isRunning ? 2 : 1.5}
      />

      {/* Checkmark (visible when COMPLETE) */}
      <path
        d={`M ${ckX} ${ckY} L ${ckMX} ${ckMY} L ${ckEX} ${ckEY}`}
        className={`ograph-checkmark${isComplete ? ' ograph-checkmark--visible' : ''}`}
      />

      {/* Label below */}
      <text
        x={node.cx}
        y={node.cy + R + 14}
        className={`ograph-node-label ograph-node-label--${statusLabel}`}
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
  const fromNode = nodeById(edge.from);
  const toNode   = nodeById(edge.to);

  const [x1, y1, x2, y2] = shortenLine(
    fromNode.cx, fromNode.cy,
    toNode.cx,   toNode.cy,
    R + 8,
  );

  let cls = 'ograph-edge';
  if (state === 'active')   cls += ' ograph-edge--active';
  if (state === 'complete') cls += ' ograph-edge--complete';

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
// Main component
// ─────────────────────────────────────────────

export default function OrchestrationGraph({
  agentStates,
  investigationStatus,
}: OrchestrationGraphProps) {

  /**
   * Resolve the AgentStatus for a graph node.
   * Orchestrator is synthetic: RUNNING when investigation is running, COMPLETE when done.
   */
  function getNodeStatus(nodeId: NodeId): AgentStatus {
    if (nodeId === 'orchestrator') {
      if (investigationStatus === 'COMPLETE') return AgentStatus.COMPLETE;
      if (investigationStatus === 'PENDING' || investigationStatus === '') return AgentStatus.IDLE;
      return AgentStatus.RUNNING;
    }

    // Pipeline synthesis nodes — infer from investigation status
    if (nodeId === 'root_cause') {
      if (investigationStatus === 'COMPLETE') return AgentStatus.COMPLETE;
      if (investigationStatus === 'root_cause' || investigationStatus === 'fix_proposed') return AgentStatus.COMPLETE;
      const scoutKeys = ['Log Scout', 'Code Hunter', 'Infra Scout', 'Security Scout'];
      const allScoutsDone = scoutKeys.every(
        k => agentStates[k] === AgentStatus.COMPLETE || agentStates[k] === AgentStatus.FAILED,
      );
      if (allScoutsDone && investigationStatus === 'RUNNING') return AgentStatus.RUNNING;
      return AgentStatus.IDLE;
    }

    if (nodeId === 'fix_agent') {
      if (investigationStatus === 'COMPLETE')     return AgentStatus.COMPLETE;
      if (investigationStatus === 'fix_proposed') return AgentStatus.COMPLETE;
      if (investigationStatus === 'root_cause')   return AgentStatus.RUNNING;
      return AgentStatus.IDLE;
    }

    if (nodeId === 'verification') {
      if (investigationStatus === 'COMPLETE')     return AgentStatus.COMPLETE;
      if (investigationStatus === 'fix_proposed') return AgentStatus.RUNNING;
      return AgentStatus.IDLE;
    }

    // Scout agents — look up directly
    const node = nodeById(nodeId);
    if (node.agentKey && agentStates[node.agentKey] !== undefined) {
      return agentStates[node.agentKey];
    }

    return AgentStatus.IDLE;
  }

  function getEdgeState(edge: EdgeDef): 'idle' | 'active' | 'complete' {
    return edgeState(edge, getNodeStatus);
  }

  return (
    <div className="ograph-wrapper">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ograph-svg"
        aria-label="Spider-Sense agent pipeline graph"
        role="img"
      >
        <defs>
          {/* Arrowhead markers for each edge state */}
          <marker id="arrow-idle"     markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" className="ograph-arrow-idle" />
          </marker>
          <marker id="arrow-active"   markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" className="ograph-arrow-active" />
          </marker>
          <marker id="arrow-complete" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" className="ograph-arrow-complete" />
          </marker>

          {/* Glow filter for running nodes */}
          <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="1 0.6 0 0 0  0.6 0.4 0 0 0  0 0 0 0 0  0 0 0 0.8 0"
              result="colored" />
            <feMerge>
              <feMergeNode in="colored" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Stage lane labels */}
        <text x={80}  y={16} className="ograph-stage-label">Orchestrator</text>
        <text x={240} y={16} className="ograph-stage-label">Parallel Scouts</text>
        <text x={430} y={16} className="ograph-stage-label">Root Cause</text>
        <text x={600} y={16} className="ograph-stage-label">Fix</text>
        <text x={750} y={16} className="ograph-stage-label">Verify</text>

        {/* Edges (drawn before nodes so nodes render on top) */}
        {EDGES.map(edge => {
          const state = getEdgeState(edge);
          const markerId = `arrow-${state}`;
          return (
            <GraphEdge
              key={`${edge.from}-${edge.to}`}
              edge={edge}
              state={state}
              markerId={markerId}
            />
          );
        })}

        {/* Nodes */}
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

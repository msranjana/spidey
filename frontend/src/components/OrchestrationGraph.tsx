/**
 * OrchestrationGraph.tsx — Spider-Sense technical SVG pipeline
 *
 * Block-diagram schematic: orthogonal bus routing, thin strokes, no glow.
 *   Orchestrator ──► [Log Scout, Code Hunter, Infra Scout, Security Scout]
 *                          │
 *                          ▼
 *                     Root Cause ──► Fix Agent ──► Verification
 */

import { useState, type KeyboardEvent } from 'react';
import './OrchestrationGraph.css';
import { AgentStatus } from '../types';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface OrchestrationGraphProps {
  agentStates: Record<string, AgentStatus>;
  investigationStatus: string;
  selectedAgent?: string | null;
  onAgentClick?: (agentName: string) => void;
}

// ─────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────

const W  = 860;
const H  = 340;
const LY = 18;

const FANOUT_BUS_X = 175;
const FANIN_BUS_X  = 375;

const PIPE_W = 56;
const PIPE_H = 28;
const SCOUT_W = 72;
const SCOUT_H = 22;

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
  agentKey: string | null;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const SCOUT_CY = [70, 135, 200, 265] as const;

const NODES: NodeDef[] = [
  { id: 'orchestrator',   label: 'Orchestrator',   agentKey: null,             cx: 90,  cy: 167, w: PIPE_W,  h: PIPE_H  },
  { id: 'log_scout',      label: 'Log Scout',       agentKey: 'Log Scout',      cx: 260, cy: SCOUT_CY[0], w: SCOUT_W, h: SCOUT_H },
  { id: 'code_hunter',    label: 'Code Hunter',     agentKey: 'Code Hunter',    cx: 260, cy: SCOUT_CY[1], w: SCOUT_W, h: SCOUT_H },
  { id: 'infra_scout',    label: 'Infra Scout',     agentKey: 'Infra Scout',    cx: 260, cy: SCOUT_CY[2], w: SCOUT_W, h: SCOUT_H },
  { id: 'security_scout', label: 'Security Scout',  agentKey: 'Security Scout', cx: 260, cy: SCOUT_CY[3], w: SCOUT_W, h: SCOUT_H },
  { id: 'root_cause',     label: 'Root Cause',      agentKey: null,             cx: 450, cy: 167, w: PIPE_W,  h: PIPE_H  },
  { id: 'fix_agent',      label: 'Fix Agent',       agentKey: null,             cx: 620, cy: 167, w: PIPE_W,  h: PIPE_H  },
  { id: 'verification',   label: 'Verification',    agentKey: null,             cx: 780, cy: 167, w: PIPE_W,  h: PIPE_H  },
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

const SCOUT_IDS: Set<NodeId> = new Set([
  'log_scout', 'code_hunter', 'infra_scout', 'security_scout',
]);

const STAGE_COLUMNS = [90, 260, 450, 620, 780] as const;

const NODE_FILL = '#0f172a';

const STATUS_STROKE: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]:     '#475569',
  [AgentStatus.RUNNING]:  '#d97706',
  [AgentStatus.COMPLETE]: '#16a34a',
  [AgentStatus.FAILED]:   '#dc2626',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function nodeById(id: NodeId): NodeDef {
  return NODES.find(n => n.id === id)!;
}

function nodeLeft(n: NodeDef): number { return n.cx - n.w / 2; }
function nodeRight(n: NodeDef): number { return n.cx + n.w / 2; }

function buildEdgePath(edge: EdgeDef): string {
  const src = nodeById(edge.from);
  const dst = nodeById(edge.to);

  if (edge.from === 'orchestrator' && SCOUT_IDS.has(edge.to)) {
    return `M ${nodeRight(src)} ${src.cy} H ${FANOUT_BUS_X} V ${dst.cy} H ${nodeLeft(dst)}`;
  }

  if (SCOUT_IDS.has(edge.from) && edge.to === 'root_cause') {
    return `M ${nodeRight(src)} ${src.cy} H ${FANIN_BUS_X} V ${dst.cy} H ${nodeLeft(dst)}`;
  }

  return `M ${nodeRight(src)} ${src.cy} H ${nodeLeft(dst)}`;
}

function computeEdgeState(
  edge: EdgeDef,
  getStatus: (id: NodeId) => AgentStatus,
): 'idle' | 'active' | 'complete' {
  const srcStatus = getStatus(edge.from);
  const dstStatus = getStatus(edge.to);
  if (dstStatus === AgentStatus.COMPLETE) return 'complete';
  if (srcStatus === AgentStatus.RUNNING || dstStatus === AgentStatus.RUNNING) return 'active';
  return 'idle';
}

function busSegmentState(
  edges: EdgeDef[],
  getEdgeState: (e: EdgeDef) => 'idle' | 'active' | 'complete',
): 'idle' | 'active' | 'complete' {
  let best: 'idle' | 'active' | 'complete' = 'idle';
  for (const e of edges) {
    const s = getEdgeState(e);
    if (s === 'complete') best = 'complete';
    else if (s === 'active' && best !== 'complete') best = 'active';
  }
  return best;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface NodeProps {
  node: NodeDef;
  status: AgentStatus;
  isSelected: boolean;
  isClickable: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function GraphNode({
  node,
  status,
  isSelected,
  isClickable,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: NodeProps) {
  const stroke     = STATUS_STROKE[status];
  const isRunning  = status === AgentStatus.RUNNING;
  const isComplete = status === AgentStatus.COMPLETE;
  const isFailed   = status === AgentStatus.FAILED;
  const statusLow  = status.toLowerCase();

  const x = nodeLeft(node);
  const y = node.cy - node.h / 2;

  const arm  = Math.min(node.w, node.h) * 0.22;
  const ckX  = node.cx - arm * 0.85;
  const ckY  = node.cy;
  const ckMX = node.cx - arm * 0.05;
  const ckMY = node.cy + arm * 0.7;
  const ckEX = node.cx + arm * 1.1;
  const ckEY = node.cy - arm * 0.7;

  const nodeClass = [
    'ograph-node',
    isClickable ? 'ograph-node--clickable' : '',
    isSelected ? 'ograph-node--selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <g
      className={nodeClass}
      role={isClickable ? 'button' : 'img'}
      aria-label={`${node.label}: ${status}`}
      aria-pressed={isClickable ? isSelected : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isSelected && (
        <rect
          x={x - 4}
          y={y - 4}
          width={node.w + 8}
          height={node.h + 8}
          rx={5}
          className="ograph-selected-ring"
        />
      )}

      {isClickable && (
        <rect
          x={x - 2}
          y={y - 2}
          width={node.w + 4}
          height={node.h + 4}
          className="ograph-node-hit"
        />
      )}

      <rect
        x={x}
        y={y}
        width={node.w}
        height={node.h}
        rx={3}
        className="ograph-node-box"
        fill={NODE_FILL}
        stroke={stroke}
      />

      {isRunning && (
        <rect
          x={x}
          y={y}
          width={3}
          height={node.h}
          className="ograph-running-bar"
        />
      )}

      {isComplete && (
        <path
          d={`M ${ckX} ${ckY} L ${ckMX} ${ckMY} L ${ckEX} ${ckEY}`}
          className="ograph-checkmark ograph-checkmark--visible"
        />
      )}

      {isFailed && (
        <path
          d={`M ${node.cx - arm} ${node.cy - arm} L ${node.cx + arm} ${node.cy + arm} M ${node.cx + arm} ${node.cy - arm} L ${node.cx - arm} ${node.cy + arm}`}
          className="ograph-failmark ograph-failmark--visible"
        />
      )}

      <text
        x={node.cx}
        y={node.cy + node.h / 2 + 13}
        className={`ograph-node-label ograph-node-label--${statusLow}`}
      >
        {node.label}
      </text>
    </g>
  );
}

interface EdgeProps {
  d: string;
  state: 'idle' | 'active' | 'complete';
  markerId: string;
}

function GraphEdge({ d, state, markerId }: EdgeProps) {
  const cls = [
    'ograph-edge',
    state === 'active'   ? 'ograph-edge--active'   : '',
    state === 'complete' ? 'ograph-edge--complete' : '',
  ].filter(Boolean).join(' ');

  return (
    <path
      d={d}
      className={cls}
      markerEnd={`url(#${markerId})`}
    />
  );
}

interface TooltipProps {
  label: string;
  status: AgentStatus;
  leftPct: number;
  topPct: number;
}

function GraphTooltip({ label, status, leftPct, topPct }: TooltipProps) {
  return (
    <div
      className="ograph-tooltip"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      role="tooltip"
    >
      <span className="ograph-tooltip__label">{label}</span>
      <span className={`ograph-tooltip__status ograph-tooltip__status--${status.toLowerCase()}`}>
        {status}
      </span>
    </div>
  );
}

const SCOUT_KEYS = ['Log Scout', 'Code Hunter', 'Infra Scout', 'Security Scout'] as const;

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
  selectedAgent = null,
  onAgentClick,
}: OrchestrationGraphProps) {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  function getNodeStatus(nodeId: NodeId): AgentStatus {
    switch (nodeId) {
      case 'orchestrator':
        if (invStatus === 'COMPLETE')                        return AgentStatus.COMPLETE;
        if (invStatus === '' || invStatus === 'PENDING')     return AgentStatus.IDLE;
        return AgentStatus.RUNNING;

      case 'root_cause':
        if (invStatus === 'fix_proposed' || invStatus === 'COMPLETE') return AgentStatus.COMPLETE;
        if (invStatus === 'root_cause')                               return AgentStatus.RUNNING;
        if (invStatus === 'RUNNING' && allScoutsDone(agentStates))    return AgentStatus.RUNNING;
        return AgentStatus.IDLE;

      case 'fix_agent':
        if (invStatus === 'COMPLETE')                        return AgentStatus.COMPLETE;
        if (invStatus === 'fix_proposed')                    return AgentStatus.COMPLETE;
        if (invStatus === 'root_cause')                      return AgentStatus.RUNNING;
        return AgentStatus.IDLE;

      case 'verification':
        if (invStatus === 'COMPLETE')                        return AgentStatus.COMPLETE;
        if (invStatus === 'fix_proposed')                    return AgentStatus.RUNNING;
        return AgentStatus.IDLE;

      default: {
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

  const hoveredNode = hoveredAgent
    ? NODES.find(n => n.agentKey === hoveredAgent)
    : null;

  const stageLabelX = {
    orchestrator:  90,
    scouts:       260,
    rootCause:    450,
    fix:          620,
    verify:       780,
  };

  const fanoutEdges = EDGES.filter(e => e.from === 'orchestrator');
  const faninEdges  = EDGES.filter(e => e.to === 'root_cause' && SCOUT_IDS.has(e.from));

  const fanoutBusState = busSegmentState(fanoutEdges, getEdgeState);
  const faninBusState  = busSegmentState(faninEdges, getEdgeState);

  const orchestrator = nodeById('orchestrator');
  const rootCause    = nodeById('root_cause');

  const fanoutTrunkD = `M ${nodeRight(orchestrator)} ${orchestrator.cy} H ${FANOUT_BUS_X}`;
  const faninTrunkD  = `M ${FANIN_BUS_X} ${rootCause.cy} H ${nodeLeft(rootCause)}`;
  const fanoutBusD   = `M ${FANOUT_BUS_X} ${SCOUT_CY[0]} V ${SCOUT_CY[3]}`;
  const faninBusD    = `M ${FANIN_BUS_X} ${SCOUT_CY[0]} V ${SCOUT_CY[3]}`;

  return (
    <div className="ograph-wrapper">
      {hoveredNode && hoveredNode.agentKey && (
        <GraphTooltip
          label={hoveredNode.label}
          status={getNodeStatus(hoveredNode.id)}
          leftPct={(hoveredNode.cx / W) * 100}
          topPct={((hoveredNode.cy - hoveredNode.h / 2 - 10) / H) * 100}
        />
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ograph-svg"
        aria-label="Spider-Sense agent pipeline graph"
        role="img"
      >
        <defs>
          <marker id="arrow-idle"     markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
            <path d="M0,0 L0,5 L5,2.5 z" className="ograph-arrow-idle" />
          </marker>
          <marker id="arrow-active"   markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
            <path d="M0,0 L0,5 L5,2.5 z" className="ograph-arrow-active" />
          </marker>
          <marker id="arrow-complete" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
            <path d="M0,0 L0,5 L5,2.5 z" className="ograph-arrow-complete" />
          </marker>
        </defs>

        {STAGE_COLUMNS.map(x => (
          <line
            key={`guide-${x}`}
            x1={x}
            y1={28}
            x2={x}
            y2={H - 12}
            className="ograph-guide"
          />
        ))}

        <text x={stageLabelX.orchestrator} y={LY} className="ograph-stage-label">Orchestrator</text>
        <text x={stageLabelX.scouts}       y={LY} className="ograph-stage-label">Parallel Scouts</text>
        <text x={stageLabelX.rootCause}    y={LY} className="ograph-stage-label">Root Cause</text>
        <text x={stageLabelX.fix}          y={LY} className="ograph-stage-label">Fix</text>
        <text x={stageLabelX.verify}       y={LY} className="ograph-stage-label">Verify</text>

        {/* Bus backbone */}
        <GraphEdge d={fanoutBusD} state={fanoutBusState} markerId="arrow-idle" />
        <GraphEdge d={faninBusD}  state={faninBusState}  markerId="arrow-idle" />
        <GraphEdge d={fanoutTrunkD} state={getEdgeState(fanoutEdges[0])} markerId={`arrow-${getEdgeState(fanoutEdges[0])}`} />
        <GraphEdge d={faninTrunkD}  state={getEdgeState(faninEdges[0])}  markerId={`arrow-${getEdgeState(faninEdges[0])}`} />

        {/* Scout stubs to buses */}
        {SCOUT_IDS.size > 0 && [...SCOUT_IDS].map(id => {
          const scout = nodeById(id);
          const fanoutStub = `M ${FANOUT_BUS_X} ${scout.cy} H ${nodeLeft(scout)}`;
          const faninStub  = `M ${nodeRight(scout)} ${scout.cy} H ${FANIN_BUS_X}`;
          const fanoutEdge = EDGES.find(e => e.from === 'orchestrator' && e.to === id)!;
          const faninEdge  = EDGES.find(e => e.from === id && e.to === 'root_cause')!;
          const fanoutState = getEdgeState(fanoutEdge);
          const faninState  = getEdgeState(faninEdge);
          return (
            <g key={`stubs-${id}`}>
              <GraphEdge d={fanoutStub} state={fanoutState} markerId={`arrow-${fanoutState}`} />
              <GraphEdge d={faninStub}  state={faninState}  markerId={`arrow-${faninState}`} />
            </g>
          );
        })}

        {/* Linear pipeline */}
        {EDGES.filter(e => !SCOUT_IDS.has(e.from) && e.from !== 'orchestrator').map(edge => {
          const state = getEdgeState(edge);
          return (
            <GraphEdge
              key={`${edge.from}→${edge.to}`}
              d={buildEdgePath(edge)}
              state={state}
              markerId={`arrow-${state}`}
            />
          );
        })}

        {/* Junction dots */}
        {[FANOUT_BUS_X, FANIN_BUS_X].map(busX => (
          SCOUT_CY.map(cy => (
            <circle key={`${busX}-${cy}`} cx={busX} cy={cy} r={2} className="ograph-junction" />
          ))
        ))}
        <circle cx={FANOUT_BUS_X} cy={orchestrator.cy} r={2} className="ograph-junction" />
        <circle cx={FANIN_BUS_X} cy={rootCause.cy} r={2} className="ograph-junction" />

        {NODES.map(node => {
          const isScout = node.agentKey !== null;
          const isSelected = isScout && selectedAgent === node.agentKey;

          return (
            <GraphNode
              key={node.id}
              node={node}
              status={getNodeStatus(node.id)}
              isSelected={isSelected}
              isClickable={isScout}
              onClick={isScout && node.agentKey
                ? () => onAgentClick?.(node.agentKey!)
                : undefined}
              onMouseEnter={isScout && node.agentKey
                ? () => setHoveredAgent(node.agentKey!)
                : undefined}
              onMouseLeave={isScout
                ? () => setHoveredAgent(null)
                : undefined}
            />
          );
        })}
      </svg>
    </div>
  );
}

/**
 * EvidenceExplorer — professional DevTools-style evidence panel.
 */

import { useEffect, useMemo, useState } from 'react';
import './EvidenceExplorer.css';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface EvidenceExplorerProps {
  agentName: string;
  findings: string[];
  evidence: Record<string, unknown>;
}

type EvidenceTab = 'overview' | 'logs' | 'code' | 'config' | 'infra';

interface LogLine {
  ts: string;
  level: string;
  service: string;
  msg: string;
}

interface CodeFile {
  path: string;
  language: string;
  snippet: string;
  issues?: string[];
}

interface TabMeta {
  id: EvidenceTab;
  label: string;
  hint: string;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const AGENT_ICONS: Record<string, string> = {
  'Log Scout':      'LS',
  'Code Hunter':    'CH',
  'Infra Scout':    'IS',
  'Security Scout': 'SS',
  'Root Cause':     'RC',
  'Fix':            'FX',
  'Verification':   'VF',
};

const AGENT_DEFAULT_TAB: Record<string, EvidenceTab> = {
  'Log Scout':      'logs',
  'Code Hunter':    'code',
  'Infra Scout':    'infra',
  'Security Scout': 'overview',
  'Root Cause':     'overview',
  'Fix':            'config',
  'Verification':   'overview',
};

const TABS: TabMeta[] = [
  { id: 'overview', label: 'Overview', hint: 'Findings and metrics' },
  { id: 'logs',     label: 'Logs',     hint: 'Structured log stream' },
  { id: 'code',     label: 'Code',     hint: 'Source snippets' },
  { id: 'config',   label: 'Config',   hint: 'Configuration diff' },
  { id: 'infra',    label: 'Infra',    hint: 'Cluster snapshot' },
];

const DEMO_CODE_SNIPPETS: Record<string, { language: string; snippet: string; issues: string[] }> = {
  'src/db/pool.py': {
    language: 'python',
    snippet:
      'class ConnectionPool:\n'
      + '    POOL_SIZE = 10  # TODO: make configurable\n\n'
      + '    def connect(self):\n'
      + '        # BUG: no timeout — will block indefinitely\n'
      + '        conn = self._pool.acquire()  # missing timeout=\n'
      + '        return conn',
    issues: ['missing_timeout', 'hardcoded_pool_size'],
  },
  'src/db/connection.py': {
    language: 'python',
    snippet:
      'def get_db_connection():\n'
      + '    pool = ConnectionPool()\n'
      + '    # No circuit breaker, no retry limit\n'
      + '    return pool.connect()',
    issues: ['no_circuit_breaker'],
  },
  'src/api/routes.py': {
    language: 'python',
    snippet:
      "@app.route('/api/products')\n"
      + 'def get_products():\n'
      + '    db = get_db_connection()  # can hang forever\n'
      + '    return db.query(\'SELECT * FROM products\')',
    issues: ['missing_timeout'],
  },
};

const DEMO_CONFIG = [
  'DATABASE_URL=postgres://app:***@postgres:5432/appdb',
  'DB_POOL_SIZE=10',
  'DB_POOL_TIMEOUT=',
  'LOG_LEVEL=info',
  'K8S_NAMESPACE=production',
].join('\n');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  );
}

function formatScalar(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value;
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item === 'string') as string[];
}

function asLogLines(value: unknown): LogLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const row = item as Record<string, unknown>;
      return {
        ts: String(row.ts ?? row.timestamp ?? ''),
        level: String(row.level ?? 'INFO'),
        service: String(row.service ?? row.source ?? 'unknown'),
        msg: String(row.msg ?? row.message ?? ''),
      };
    })
    .filter(row => row.msg.length > 0);
}

function synthesizeLogLines(evidence: Record<string, unknown>): LogLine[] {
  if (!evidence.error_count && !evidence.critical_pattern && !evidence.log_lines_analyzed) {
    return [];
  }

  const errorCount = typeof evidence.error_count === 'number' ? evidence.error_count : 847;
  const pattern = String(evidence.critical_pattern ?? 'connection_refused');
  const firstTs = String(evidence.first_error_ts ?? '2026-08-12T15:01:34Z');
  const lastTs = String(evidence.last_error_ts ?? '2026-08-12T15:16:22Z');

  return [
    { ts: firstTs, level: 'WARN', service: 'api-gateway', msg: 'DB query latency spike: p99=1840ms — db_pool=9/10 active' },
    { ts: firstTs, level: 'ERROR', service: 'postgres-0', msg: 'FATAL: could not write to file \'pg_wal/...\': No space left on device' },
    { ts: firstTs, level: 'ERROR', service: 'postgres-0', msg: 'database system is shut down — disk exhaustion at 10.0Gi / 10.0Gi (100%)' },
    { ts: firstTs, level: 'ERROR', service: 'api-gateway', msg: 'connect() to postgres:5432 failed: Connection refused — retry 5/5' },
    { ts: lastTs, level: 'ERROR', service: 'api-gateway', msg: `ConnectionPoolExhausted: all 10 connections failed — pattern=${pattern}` },
    { ts: lastTs, level: 'CRITICAL', service: 'api-gateway', msg: `ALERT: ${errorCount} requests failed (503) in last 15 minutes — error_rate=100%` },
    { ts: lastTs, level: 'CRITICAL', service: 'alertmanager', msg: '[FIRING] APIHighErrorRate severity=critical for=5m' },
  ];
}

function extractCodeFiles(evidence: Record<string, unknown>): CodeFile[] {
  const fromEvidence = evidence.relevant_files;
  if (Array.isArray(fromEvidence)) {
    return fromEvidence
      .filter(item => item && typeof item === 'object')
      .map(item => {
        const row = item as Record<string, unknown>;
        return {
          path: String(row.path ?? 'unknown'),
          language: String(row.language ?? 'text'),
          snippet: String(row.snippet ?? ''),
          issues: asStringArray(row.issues),
        };
      })
      .filter(file => file.snippet.length > 0);
  }

  const paths = asStringArray(evidence.affected_files);
  if (paths.length === 0) return [];

  return paths.map(path => {
    const demo = DEMO_CODE_SNIPPETS[path];
    return {
      path,
      language: demo?.language ?? 'text',
      snippet: demo?.snippet ?? `# ${path}\n# (snippet not available in evidence)`,
      issues: demo?.issues ?? [],
    };
  });
}

function extractConfigText(evidence: Record<string, unknown>): string | null {
  if (typeof evidence.config_snippet === 'string' && evidence.config_snippet.trim()) {
    return evidence.config_snippet;
  }
  if (typeof evidence.proposed_fix_diff === 'string' && evidence.proposed_fix_diff.trim()) {
    return evidence.proposed_fix_diff;
  }
  const changes = asRecord(evidence.config_changes);
  if (changes) {
    const lines = Object.entries(changes).map(([key, val]) => {
      const entry = asRecord(val);
      if (entry) {
        const from = entry.from ?? '—';
        const to = entry.to ?? '—';
        return `${key}=${to}  # was: ${from}`;
      }
      return `${key}=${formatScalar(val as string | number | boolean | null)}`;
    });
    return lines.join('\n');
  }
  if (evidence.files_scanned || evidence.affected_files) {
    return DEMO_CONFIG;
  }
  return null;
}

function isConfigDiff(text: string): boolean {
  return text.startsWith('---') || text.includes('\n+++') || text.includes('\n@@');
}

function logLevelClass(level: string): string {
  const normalized = level.toUpperCase();
  if (normalized === 'ERROR' || normalized === 'CRITICAL') return 'error';
  if (normalized === 'WARN' || normalized === 'WARNING') return 'warn';
  if (normalized === 'INFO') return 'info';
  return 'debug';
}

function chipTone(key: string, value: unknown): string {
  const k = key.toLowerCase();
  if (k.includes('error') || (k.includes('severity') && (value === 'high' || value === 'critical'))) {
    return 'alert';
  }
  if (k.includes('confidence') || k.includes('health') || k.includes('verdict')) {
    return 'ok';
  }
  if (k.includes('disk') || k.includes('restart') || k.includes('pod')) {
    return 'warn';
  }
  return 'default';
}

function formatShortTs(ts: string): string {
  if (!ts) return '—';
  const match = ts.match(/T(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : ts;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface EvidenceNodeProps {
  label: string;
  value: unknown;
  depth?: number;
}

function EvidenceNode({ label, value, depth = 0 }: EvidenceNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const type = valueType(value);
  const isExpandable = type === 'object' || type === 'array';

  if (!isExpandable) {
    return (
      <div className="evidence-node evidence-node--leaf" style={{ paddingLeft: depth * 14 }}>
        <span className="evidence-node__key">{formatKey(label)}</span>
        <span className={`evidence-node__value evidence-node__value--${type}`}>
          {formatScalar(value as string | number | boolean | null)}
        </span>
      </div>
    );
  }

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((item, i) => [String(i), item])
    : Object.entries(value as Record<string, unknown>);

  const preview = Array.isArray(value)
    ? `${value.length} item${value.length === 1 ? '' : 's'}`
    : `${entries.length} field${entries.length === 1 ? '' : 's'}`;

  return (
    <div className="evidence-node evidence-node--branch" style={{ paddingLeft: depth * 14 }}>
      <button
        type="button"
        className="evidence-node__toggle"
        onClick={() => setExpanded(prev => !prev)}
        aria-expanded={expanded}
      >
        <span className={`evidence-node__chevron${expanded ? ' evidence-node__chevron--open' : ''}`} aria-hidden="true">
          ▸
        </span>
        <span className="evidence-node__key">{formatKey(label)}</span>
        <span className="evidence-node__preview">{preview}</span>
      </button>

      {expanded && (
        <div className="evidence-node__children">
          {entries.length === 0 ? (
            <div className="evidence-node__empty">Empty {type}</div>
          ) : (
            entries.map(([childKey, childValue]) => (
              <EvidenceNode
                key={childKey}
                label={childKey}
                value={childValue}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="evidence-empty" role="status">
      <span className="evidence-empty__glyph" aria-hidden="true">∅</span>
      <p className="evidence-empty__title">{title}</p>
      {detail && <p className="evidence-empty__detail">{detail}</p>}
    </div>
  );
}

function PanelToolbar({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="evidence-panel-toolbar">
      <span className="evidence-panel-toolbar__label">{label}</span>
      {meta && <span className="evidence-panel-toolbar__meta">{meta}</span>}
    </div>
  );
}

function CodeBlock({ code, language, diff = false }: { code: string; language?: string; diff?: boolean }) {
  const lines = code.split('\n');

  if (diff) {
    return (
      <pre className="evidence-code-block evidence-code-block--diff" data-language={language ?? 'diff'}>
        <code>
          {lines.map((line, i) => {
            let cls = 'ctx';
            if (line.startsWith('+++') || line.startsWith('---')) cls = 'hdr';
            else if (line.startsWith('+')) cls = 'add';
            else if (line.startsWith('-')) cls = 'del';
            return (
              <span key={i} className={`evidence-diff-line evidence-diff-line--${cls}`}>
                {line}
                {'\n'}
              </span>
            );
          })}
        </code>
      </pre>
    );
  }

  return (
    <div className="evidence-code-wrap">
      <div className="evidence-code-lines" aria-hidden="true">
        {lines.map((_, i) => (
          <span key={i} className="evidence-code-lines__num">{i + 1}</span>
        ))}
      </div>
      <pre className="evidence-code-block" data-language={language ?? 'text'}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function LogViewer({ lines }: { lines: LogLine[] }) {
  const errorCount = lines.filter(l => logLevelClass(l.level) === 'error').length;

  return (
    <>
      <PanelToolbar
        label="Log stream"
        meta={`${lines.length} lines · ${errorCount} critical/error`}
      />
      <div className="evidence-log-viewer" role="log" aria-label="Log evidence">
        {lines.map((line, i) => (
          <div key={`${line.ts}-${i}`} className="evidence-log-line">
            <span className="evidence-log-line__ts" title={line.ts}>
              {formatShortTs(line.ts)}
            </span>
            <span className={`evidence-log-line__level evidence-log-line__level--${logLevelClass(line.level)}`}>
              {line.level}
            </span>
            <span className="evidence-log-line__service">{line.service}</span>
            <span className="evidence-log-line__msg">{line.msg}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function InfraViewer({ evidence }: { evidence: Record<string, unknown> }) {
  const infraState = asRecord(evidence.infra_state);
  const podsFromState = infraState && Array.isArray(infraState.pods) ? infraState.pods : null;

  const podStatus = evidence.pod_status;
  const podRestarts = evidence.pod_restarts;
  const diskPct = evidence.disk_usage_pct;
  const diskUsed = evidence.disk_used_gi;
  const diskCap = evidence.disk_capacity_gi;
  const nodeCpu = evidence.node_cpu_pct;
  const nodeMem = evidence.node_mem_pct;

  const synthesizedPods = podsFromState ?? (
    podStatus != null
      ? [{
          name: 'postgres-0',
          namespace: 'production',
          status: String(podStatus),
          restarts: podRestarts ?? 0,
          ready: false,
        }]
      : null
  );

  const hasScalars =
    podStatus != null
    || podRestarts != null
    || diskPct != null
    || nodeCpu != null
    || nodeMem != null;

  if (!synthesizedPods && !hasScalars) {
    return <EmptyState title="No infrastructure evidence" detail="Cluster metrics will appear when Infra Scout completes." />;
  }

  return (
  <>
    <PanelToolbar label="Cluster snapshot" meta={hasScalars ? 'Live metrics' : 'Table view'} />
    <div className="evidence-infra-viewer">
      {hasScalars && (
        <div className="evidence-infra-grid">
          {podStatus != null && (
            <div className="evidence-infra-card evidence-infra-card--alert">
              <span className="evidence-infra-card__label">Pod Status</span>
              <span className="evidence-infra-card__value">{String(podStatus)}</span>
            </div>
          )}
          {podRestarts != null && (
            <div className="evidence-infra-card">
              <span className="evidence-infra-card__label">Restarts</span>
              <span className="evidence-infra-card__value">{String(podRestarts)}</span>
            </div>
          )}
          {diskPct != null && (
            <div className="evidence-infra-card evidence-infra-card--alert">
              <span className="evidence-infra-card__label">Disk Usage</span>
              <span className="evidence-infra-card__value">
                {String(diskPct)}%
                {diskUsed != null && diskCap != null ? ` (${diskUsed}/${diskCap} Gi)` : ''}
              </span>
              {typeof diskPct === 'number' && (
                <div className="evidence-infra-bar" aria-hidden="true">
                  <div
                    className="evidence-infra-bar__fill"
                    style={{ width: `${Math.min(diskPct, 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {nodeCpu != null && (
            <div className="evidence-infra-card">
              <span className="evidence-infra-card__label">Node CPU</span>
              <span className="evidence-infra-card__value">{String(nodeCpu)}%</span>
              {typeof nodeCpu === 'number' && (
                <div className="evidence-infra-bar evidence-infra-bar--cpu" aria-hidden="true">
                  <div className="evidence-infra-bar__fill" style={{ width: `${Math.min(nodeCpu, 100)}%` }} />
                </div>
              )}
            </div>
          )}
          {nodeMem != null && (
            <div className="evidence-infra-card">
              <span className="evidence-infra-card__label">Node Memory</span>
              <span className="evidence-infra-card__value">{String(nodeMem)}%</span>
              {typeof nodeMem === 'number' && (
                <div className="evidence-infra-bar evidence-infra-bar--mem" aria-hidden="true">
                  <div className="evidence-infra-bar__fill" style={{ width: `${Math.min(nodeMem, 100)}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {synthesizedPods && (
        <div className="evidence-infra-table-wrap">
          <table className="evidence-infra-table">
            <thead>
              <tr>
                <th>Pod</th>
                <th>Namespace</th>
                <th>Status</th>
                <th>Restarts</th>
                <th>Ready</th>
              </tr>
            </thead>
            <tbody>
              {synthesizedPods.map((pod, i) => {
                const row = pod as Record<string, unknown>;
                const status = String(row.status ?? '—');
                const isBad = /crash|error|backoff/i.test(status);
                return (
                  <tr key={i}>
                    <td className="evidence-infra-table__mono">{String(row.name ?? '—')}</td>
                    <td>{String(row.namespace ?? '—')}</td>
                    <td>
                      <span className={`evidence-status-pill${isBad ? ' evidence-status-pill--bad' : ' evidence-status-pill--ok'}`}>
                        {status}
                      </span>
                    </td>
                    <td>{String(row.restarts ?? '—')}</td>
                    <td>
                      <span className={row.ready === true ? 'evidence-ready--yes' : 'evidence-ready--no'}>
                        {row.ready === true ? 'Ready' : 'Not ready'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </>
  );
}

interface TabPanelProps {
  tab: EvidenceTab;
  findings: string[];
  evidence: Record<string, unknown>;
  evidenceEntries: [string, unknown][];
  scalarEntries: [string, unknown][];
  complexEntries: [string, unknown][];
  logLines: LogLine[];
  codeFiles: CodeFile[];
  configText: string | null;
}

function TabPanel({
  tab,
  findings,
  evidence,
  evidenceEntries,
  scalarEntries,
  complexEntries,
  logLines,
  codeFiles,
  configText,
}: TabPanelProps) {
  const [selectedFile, setSelectedFile] = useState(0);

  useEffect(() => {
    setSelectedFile(0);
  }, [codeFiles]);

  const activeFile = codeFiles[selectedFile];
  const configIsDiff = configText ? isConfigDiff(configText) : false;

  switch (tab) {
    case 'overview':
      return (
        <div className="evidence-tab-panel">
          <div className="evidence-explorer__section">
            <h4 className="evidence-explorer__section-title">Findings</h4>
            {findings.length > 0 ? (
              <ul className="evidence-explorer__findings">
                {findings.map((finding, i) => (
                  <li key={i} className="evidence-explorer__finding">
                    <span className="evidence-explorer__finding-index">{i + 1}</span>
                    <span className="evidence-explorer__finding-text">{finding}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No findings recorded" detail="Agent output will stream here during investigation." />
            )}
          </div>

          <div className="evidence-explorer__section">
            <h4 className="evidence-explorer__section-title">Metrics</h4>
            {evidenceEntries.length === 0 ? (
              <EmptyState title="No evidence collected" detail="Structured metrics appear as scouts complete." />
            ) : (
              <>
                {scalarEntries.length > 0 && (
                  <div className="evidence-explorer__chips" role="list">
                    {scalarEntries.map(([key, value]) => (
                      <div
                        key={key}
                        className={`evidence-chip evidence-chip--${chipTone(key, value)}`}
                        role="listitem"
                      >
                        <span className="evidence-chip__key">{formatKey(key)}</span>
                        <span className="evidence-chip__value">
                          {formatScalar(value as string | number | boolean | null)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {complexEntries.length > 0 && (
                  <div className="evidence-explorer__tree">
                    {complexEntries.map(([key, value]) => (
                      <EvidenceNode key={key} label={key} value={value} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );

    case 'logs':
      return (
        <div className="evidence-tab-panel">
          {logLines.length > 0 ? (
            <LogViewer lines={logLines} />
          ) : (
            <EmptyState title="No log lines" detail="Log Scout evidence will populate this view." />
          )}
        </div>
      );

    case 'code':
      return (
        <div className="evidence-tab-panel evidence-tab-panel--split">
          {codeFiles.length > 0 ? (
            <>
              <aside className="evidence-devtools__sidebar" aria-label="Source files">
                <div className="evidence-sidebar-header">Sources</div>
                {codeFiles.map((file, i) => (
                  <button
                    key={file.path}
                    type="button"
                    className={`evidence-file-tab${i === selectedFile ? ' evidence-file-tab--active' : ''}`}
                    onClick={() => setSelectedFile(i)}
                    aria-current={i === selectedFile ? 'true' : undefined}
                  >
                    <span className="evidence-file-tab__path">{file.path}</span>
                    {file.issues && file.issues.length > 0 && (
                      <span className="evidence-file-tab__badge">{file.issues.length}</span>
                    )}
                  </button>
                ))}
              </aside>
              <div className="evidence-devtools__editor">
                {activeFile && (
                  <>
                    <div className="evidence-code-header">
                      <span className="evidence-code-header__path">{activeFile.path}</span>
                      <span className="evidence-code-header__lang">{activeFile.language}</span>
                      {activeFile.issues && activeFile.issues.length > 0 && (
                        <span className="evidence-code-header__issues">
                          {activeFile.issues.join(' · ')}
                        </span>
                      )}
                    </div>
                    <CodeBlock code={activeFile.snippet} language={activeFile.language} />
                  </>
                )}
              </div>
            </>
          ) : (
            <EmptyState title="No code snippets" detail="Code Hunter will surface affected files here." />
          )}
        </div>
      );

    case 'config':
      return (
        <div className="evidence-tab-panel">
          {configText ? (
            <>
              <PanelToolbar
                label={configIsDiff ? 'Configuration diff' : 'Configuration'}
                meta={configIsDiff ? 'Unified diff' : 'Key-value snapshot'}
              />
              <CodeBlock code={configText} language={configIsDiff ? 'diff' : 'ini'} diff={configIsDiff} />
            </>
          ) : (
            <EmptyState title="No configuration evidence" detail="Config changes and env snippets appear here." />
          )}
        </div>
      );

    case 'infra':
      return (
        <div className="evidence-tab-panel">
          <InfraViewer evidence={evidence} />
        </div>
      );

    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function EvidenceExplorer({
  agentName,
  findings,
  evidence,
}: EvidenceExplorerProps) {
  const defaultTab = AGENT_DEFAULT_TAB[agentName] ?? 'overview';
  const [activeTab, setActiveTab] = useState<EvidenceTab>(defaultTab);

  useEffect(() => {
    setActiveTab(AGENT_DEFAULT_TAB[agentName] ?? 'overview');
  }, [agentName]);

  const evidenceEntries = Object.entries(evidence);
  const scalarEntries = evidenceEntries.filter(([, v]) => isScalar(v));
  const complexEntries = evidenceEntries.filter(([, v]) => !isScalar(v));
  const icon = AGENT_ICONS[agentName] ?? 'AG';

  const logLines = useMemo(() => {
    const fromEvidence = asLogLines(evidence.log_lines);
    return fromEvidence.length > 0 ? fromEvidence : synthesizeLogLines(evidence);
  }, [evidence]);

  const codeFiles = useMemo(() => extractCodeFiles(evidence), [evidence]);
  const configText = useMemo(() => extractConfigText(evidence), [evidence]);

  const tabCounts: Record<EvidenceTab, number> = {
    overview: findings.length + evidenceEntries.length,
    logs: logLines.length,
    code: codeFiles.length,
    config: configText ? 1 : 0,
    infra: evidence.pod_status != null || evidence.disk_usage_pct != null || evidence.infra_state != null ? 1 : 0,
  };

  return (
    <section
      className="evidence-explorer"
      aria-label={`${agentName} evidence`}
    >
      <header className="evidence-explorer__header">
        <span className="evidence-explorer__icon" aria-hidden="true">{icon}</span>
        <div className="evidence-explorer__heading">
          <h3 className="evidence-explorer__title">{agentName}</h3>
          <p className="evidence-explorer__subtitle">Evidence explorer</p>
        </div>
        <div className="evidence-explorer__stats">
          <span className="evidence-stat">
            <span className="evidence-stat__value">{findings.length}</span>
            <span className="evidence-stat__label">findings</span>
          </span>
          <span className="evidence-stat">
            <span className="evidence-stat__value">{evidenceEntries.length}</span>
            <span className="evidence-stat__label">metrics</span>
          </span>
        </div>
      </header>

      <div className="evidence-devtools">
        <nav className="evidence-devtools__tabs" aria-label="Evidence views">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`evidence-devtools__tab${activeTab === tab.id ? ' evidence-devtools__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              aria-selected={activeTab === tab.id}
              title={tab.hint}
            >
              {tab.label}
              {tabCounts[tab.id] > 0 && tab.id !== 'overview' && (
                <span className="evidence-devtools__tab-badge">{tabCounts[tab.id]}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="evidence-devtools__body">
          <TabPanel
            tab={activeTab}
            findings={findings}
            evidence={evidence}
            evidenceEntries={evidenceEntries}
            scalarEntries={scalarEntries}
            complexEntries={complexEntries}
            logLines={logLines}
            codeFiles={codeFiles}
            configText={configText}
          />
        </div>
      </div>
    </section>
  );
}

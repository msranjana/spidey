import dbConnectionFailure from '../../demo/fixtures/db_connection_failure.json';
import memoryOomKill from '../../demo/fixtures/memory_oom_kill.json';
import tlsCertificateExpiry from '../../demo/fixtures/tls_certificate_expiry.json';
import type { DemoScenario } from './types';

interface ScenarioFixture {
  scenario: {
    id: string;
    title: string;
    description: string;
    severity: string;
  };
}

function toScenario(fixture: ScenarioFixture): DemoScenario {
  const { id, title, description, severity } = fixture.scenario;
  return { id, title, description, severity };
}

export const FALLBACK_SCENARIOS: DemoScenario[] = [
  dbConnectionFailure,
  memoryOomKill,
  tlsCertificateExpiry,
].map(toScenario);
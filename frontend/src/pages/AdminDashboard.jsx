/**
 * ============================================================================
 * ADMIN DASHBOARD PAGE
 * ============================================================================
 * Analytics and monitoring for API costs, performance, and errors.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import {
  DollarSign,
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { Card, Spinner, Button, Badge } from '@components/shared';
import api from '@utils/api-client';
import styles from './AdminDashboard.module.css';

/**
 * AdminDashboard page component
 */
function AdminDashboard() {
  // State
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [usage, setUsage] = useState(null);
  const [errors, setErrors] = useState(null);
  const [period, setPeriod] = useState('week');

  // Fetch all data
  useEffect(() => {
    fetchAllData();
  }, [period]);

  async function fetchAllData() {
    setLoading(true);
    try {
      const [costsData, perfData, usageData, errorsData] = await Promise.all([
        api.admin.costs({ period }),
        api.admin.performance(),
        api.admin.usage(),
        api.admin.errors({ limit: 10 }),
      ]);

      setCosts(costsData);
      setPerformance(perfData);
      setUsage(usageData);
      setErrors(errorsData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Spinner centered text="Loading analytics..." />;
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.subtitle}>Monitor costs, performance, and errors</p>
        </div>

        <div className={styles.headerActions}>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className={styles.periodSelect}
          >
            <option value="day">Last 24 hours</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
          </select>

          <Button
            variant="secondary"
            leftIcon={RefreshCw}
            onClick={fetchAllData}
          >
            Refresh
          </Button>
        </div>
      </header>

      {/* Summary cards */}
      <div className={styles.summaryGrid}>
        <SummaryCard
          icon={DollarSign}
          label="Total Cost"
          value={`$${(costs?.totals?.cost || 0).toFixed(4)}`}
          subtext={`${costs?.totals?.calls || 0} API calls`}
          color="primary"
        />

        <SummaryCard
          icon={Clock}
          label="Avg Processing Time"
          value={`${performance?.overall?.avgDurationSeconds || 0}s`}
          subtext={`${performance?.episodesAnalyzed || 0} episodes analyzed`}
          color="info"
        />

        <SummaryCard
          icon={TrendingUp}
          label="Success Rate"
          value={`${(usage?.episodes?.successRate || 0).toFixed(1)}%`}
          subtext={`${usage?.episodes?.total || 0} total episodes`}
          color="success"
        />

        <SummaryCard
          icon={AlertTriangle}
          label="Recent Errors"
          value={errors?.totalErrors || 0}
          subtext="Failed stages"
          color="error"
        />
      </div>

      {/* Detailed sections */}
      <div className={styles.sections}>
        {/* Cost breakdown */}
        <Card title="Cost Breakdown" padding="lg">
          <div className={styles.breakdownGrid}>
            <div className={styles.breakdown}>
              <h4>By Provider</h4>
              {costs?.byProvider && Object.entries(costs.byProvider).map(([provider, data]) => (
                <div key={provider} className={styles.breakdownItem}>
                  <span className={styles.breakdownLabel}>{provider}</span>
                  <span className={styles.breakdownValue}>${data.cost.toFixed(4)}</span>
                </div>
              ))}
            </div>

            <div className={styles.breakdown}>
              <h4>By Phase</h4>
              {costs?.byPhase && Object.entries(costs.byPhase)
                .sort(([, a], [, b]) => {
                  // Sort by phase order: pregate, extract, plan, write, distribute
                  const order = { pregate: 0, extract: 1, plan: 2, write: 3, distribute: 4 };
                  return (order[a.name?.toLowerCase()] ?? 99) - (order[b.name?.toLowerCase()] ?? 99);
                })
                .map(([phaseId, data]) => (
                  <div key={phaseId} className={styles.breakdownItem}>
                    <span className={styles.breakdownLabel}>
                      {data.emoji} {data.name}
                    </span>
                    <span className={styles.breakdownValue}>${data.cost.toFixed(4)}</span>
                  </div>
                ))}
            </div>

            <div className={styles.breakdown}>
              <h4>By Stage (Detail)</h4>
              {costs?.byStage && Object.entries(costs.byStage)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([stage, data]) => (
                  <div key={stage} className={styles.breakdownItem}>
                    <span className={styles.breakdownLabel}>
                      {stage}. {data.name || `Stage ${stage}`}
                    </span>
                    <span className={styles.breakdownValue}>${data.cost.toFixed(4)}</span>
                  </div>
                ))}
            </div>
          </div>
        </Card>

        {/* Performance by phase */}
        <Card title="Phase Performance" padding="lg">
          <div className={styles.phasePerformance}>
            {performance?.byPhase && Object.entries(performance.byPhase)
              .sort(([a], [b]) => {
                // Sort by phase order
                const order = { pregate: 0, extract: 1, plan: 2, write: 3, distribute: 4 };
                return (order[a] ?? 99) - (order[b] ?? 99);
              })
              .map(([phaseId, data]) => (
                <div key={phaseId} className={styles.phaseBlock}>
                  <div className={styles.phaseHeader}>
                    <span className={styles.phaseName}>
                      {data.emoji} {data.name}
                    </span>
                    <span className={styles.phaseTotals}>
                      {(data.totalAvgDurationMs / 1000).toFixed(1)}s | ${data.totalAvgCost.toFixed(4)}
                    </span>
                  </div>
                  <div className={styles.phaseStages}>
                    {data.stages?.map((stage) => (
                      <div key={stage.number} className={styles.stageRow}>
                        <span className={styles.stageName}>
                          {stage.number}. {stage.name}
                        </span>
                        <span className={styles.stageDuration}>
                          {(stage.avgDurationMs / 1000).toFixed(1)}s
                        </span>
                        <span className={styles.stageCost}>
                          ${stage.avgCost.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </Card>

        {/* Recent errors */}
        <Card title="Recent Errors" padding="lg">
          {errors?.recentErrors?.length > 0 ? (
            <div className={styles.errorsList}>
              {errors.recentErrors.slice(0, 5).map((error, i) => (
                <div key={i} className={styles.errorItem}>
                  <div className={styles.errorHeader}>
                    <Badge variant="error">Stage {error.stageNumber}</Badge>
                    <span className={styles.errorDate}>
                      {new Date(error.failedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className={styles.errorTitle}>{error.episodeTitle}</p>
                  <p className={styles.errorMessage}>{error.error}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.noErrors}>No recent errors</p>
          )}
        </Card>

        {/* Usage projections */}
        <Card title="Usage Projections" padding="lg">
          <div className={styles.projections}>
            <div className={styles.projection}>
              <span className={styles.projectionLabel}>Daily Average Cost</span>
              <span className={styles.projectionValue}>
                ${(usage?.apiUsage?.dailyAverage?.cost || 0).toFixed(4)}
              </span>
            </div>
            <div className={styles.projection}>
              <span className={styles.projectionLabel}>Projected Monthly Cost</span>
              <span className={styles.projectionValue}>
                ${(usage?.apiUsage?.projectedMonthlyCost || 0).toFixed(2)}
              </span>
            </div>
            <div className={styles.projection}>
              <span className={styles.projectionLabel}>Episodes (Last 30 Days)</span>
              <span className={styles.projectionValue}>
                {usage?.episodes?.total || 0}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Summary card component
 */
function SummaryCard({ icon: Icon, label, value, subtext, color }) {
  return (
    <Card className={`${styles.summaryCard} ${styles[`summary-${color}`]}`}>
      <div className={styles.summaryIcon}>
        <Icon />
      </div>
      <div className={styles.summaryContent}>
        <span className={styles.summaryLabel}>{label}</span>
        <span className={styles.summaryValue}>{value}</span>
        <span className={styles.summarySubtext}>{subtext}</span>
      </div>
    </Card>
  );
}

export default AdminDashboard;

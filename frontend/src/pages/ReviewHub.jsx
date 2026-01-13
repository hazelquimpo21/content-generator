/**
 * ============================================================================
 * REVIEW HUB PAGE
 * ============================================================================
 * View and edit all generated content for an episode.
 * Tabbed interface for different content types.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Quote,
  Type,
  AlignLeft,
  Share2,
  Mail,
  Copy,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Button, Card, Spinner, Badge } from '@components/shared';
import api from '@utils/api-client';
import styles from './ReviewHub.module.css';

// Tab definitions
const TABS = [
  { id: 'analysis', label: 'Analysis', icon: FileText, stages: [1] },
  { id: 'quotes', label: 'Quotes', icon: Quote, stages: [2] },
  { id: 'titles', label: 'Titles', icon: Type, stages: [3, 4] },
  { id: 'blog', label: 'Blog Post', icon: AlignLeft, stages: [5, 6, 7] },
  { id: 'social', label: 'Social', icon: Share2, stages: [8] },
  { id: 'email', label: 'Email', icon: Mail, stages: [9] },
];

/**
 * ReviewHub page component
 */
function ReviewHub() {
  const { id: episodeId } = useParams();
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState(true);
  const [episode, setEpisode] = useState(null);
  const [stages, setStages] = useState([]);
  const [activeTab, setActiveTab] = useState('analysis');
  const [copied, setCopied] = useState(null);
  const [regenerating, setRegenerating] = useState(null);
  const [error, setError] = useState(null);

  // Fetch episode data
  useEffect(() => {
    fetchEpisode();
  }, [episodeId]);

  async function fetchEpisode() {
    try {
      setLoading(true);
      const data = await api.episodes.getWithStages(episodeId);
      setEpisode(data.episode);
      setStages(data.stages || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load episode');
    } finally {
      setLoading(false);
    }
  }

  // Get stage data by number
  function getStage(stageNumber) {
    return stages.find((s) => s.stage_number === stageNumber);
  }

  // Copy to clipboard
  async function copyToClipboard(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  // Regenerate stage
  async function handleRegenerate(stageNumber) {
    try {
      setRegenerating(stageNumber);
      await api.stages.regenerate(episodeId, stageNumber);
      await fetchEpisode();
    } catch (err) {
      setError(err.message || 'Failed to regenerate');
    } finally {
      setRegenerating(null);
    }
  }

  if (loading) {
    return <Spinner centered text="Loading content..." />;
  }

  if (!episode) {
    return (
      <Card className={styles.errorCard}>
        <AlertCircle size={48} />
        <h2>Episode Not Found</h2>
        <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
      </Card>
    );
  }

  const currentTab = TABS.find((t) => t.id === activeTab);

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {episode.episode_context?.title || 'Untitled Episode'}
          </h1>
          <p className={styles.subtitle}>Review and edit your generated content</p>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon className={styles.tabIcon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className={styles.errorBanner}>
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Tab content */}
      <div className={styles.content}>
        {activeTab === 'analysis' && (
          <AnalysisTab stage={getStage(1)} />
        )}

        {activeTab === 'quotes' && (
          <QuotesTab
            stage={getStage(2)}
            onCopy={copyToClipboard}
            copied={copied}
          />
        )}

        {activeTab === 'titles' && (
          <TitlesTab
            titleStage={getStage(3)}
            summaryStage={getStage(4)}
            onCopy={copyToClipboard}
            copied={copied}
          />
        )}

        {activeTab === 'blog' && (
          <BlogTab
            outlineStage={getStage(5)}
            draftStage={getStage(6)}
            editedStage={getStage(7)}
            onCopy={copyToClipboard}
            onRegenerate={handleRegenerate}
            copied={copied}
            regenerating={regenerating}
          />
        )}

        {activeTab === 'social' && (
          <SocialTab
            stage={getStage(8)}
            onCopy={copyToClipboard}
            copied={copied}
          />
        )}

        {activeTab === 'email' && (
          <EmailTab
            stage={getStage(9)}
            onCopy={copyToClipboard}
            copied={copied}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function AnalysisTab({ stage }) {
  if (!stage?.output_data) return <EmptyState message="No analysis data" />;

  const data = stage.output_data;

  return (
    <div className={styles.tabContent}>
      <Card title="Episode Crux" padding="lg">
        <p className={styles.crux}>{data.episode_crux}</p>
      </Card>

      <Card title="Key Themes" padding="lg">
        <div className={styles.themesList}>
          {data.key_themes?.map((theme, i) => (
            <div key={i} className={styles.theme}>
              <h4>{theme.theme}</h4>
              <p>{theme.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {data.target_audiences && (
        <Card title="Target Audiences" padding="lg">
          <ul className={styles.list}>
            {data.target_audiences.map((audience, i) => (
              <li key={i}>{audience}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function QuotesTab({ stage, onCopy, copied }) {
  if (!stage?.output_data?.quotes) return <EmptyState message="No quotes extracted" />;

  return (
    <div className={styles.tabContent}>
      {stage.output_data.quotes.map((quote, i) => (
        <Card key={i} padding="lg" className={styles.quoteCard}>
          <blockquote className={styles.quote}>
            "{quote.quote_text}"
          </blockquote>
          <p className={styles.quoteSpeaker}>— {quote.speaker}</p>
          <p className={styles.quoteContext}>{quote.context}</p>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === `quote-${i}` ? Check : Copy}
            onClick={() => onCopy(quote.quote_text, `quote-${i}`)}
          >
            {copied === `quote-${i}` ? 'Copied!' : 'Copy'}
          </Button>
        </Card>
      ))}
    </div>
  );
}

function TitlesTab({ titleStage, summaryStage, onCopy, copied }) {
  const titles = titleStage?.output_data?.titles || [];
  const summaries = summaryStage?.output_data || {};

  return (
    <div className={styles.tabContent}>
      <Card title="Generated Titles" padding="lg">
        <div className={styles.titlesList}>
          {titles.map((title, i) => (
            <div key={i} className={styles.titleItem}>
              <span className={styles.titleText}>{title.title}</span>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={copied === `title-${i}` ? Check : Copy}
                onClick={() => onCopy(title.title, `title-${i}`)}
              >
                {copied === `title-${i}` ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {summaries.short_summary && (
        <Card title="Short Summary" subtitle="1-2 sentences" padding="lg">
          <p>{summaries.short_summary}</p>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === 'short' ? Check : Copy}
            onClick={() => onCopy(summaries.short_summary, 'short')}
          >
            Copy
          </Button>
        </Card>
      )}

      {summaries.medium_summary && (
        <Card title="Medium Summary" subtitle="Paragraph length" padding="lg">
          <p>{summaries.medium_summary}</p>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === 'medium' ? Check : Copy}
            onClick={() => onCopy(summaries.medium_summary, 'medium')}
          >
            Copy
          </Button>
        </Card>
      )}
    </div>
  );
}

function BlogTab({ outlineStage, draftStage, editedStage, onCopy, onRegenerate, copied, regenerating }) {
  const blogPost = editedStage?.output_text || draftStage?.output_text;

  return (
    <div className={styles.tabContent}>
      {outlineStage?.output_data?.outline && (
        <Card title="Outline" padding="lg">
          <div className={styles.outline}>
            {outlineStage.output_data.outline.map((section, i) => (
              <div key={i} className={styles.outlineSection}>
                <h4>{section.section_title}</h4>
                <ul>
                  {section.key_points?.map((point, j) => (
                    <li key={j}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {blogPost && (
        <Card
          title="Blog Post"
          headerAction={
            <div className={styles.cardActions}>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={RefreshCw}
                loading={regenerating === 7}
                onClick={() => onRegenerate(7)}
              >
                Regenerate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={copied === 'blog' ? Check : Copy}
                onClick={() => onCopy(blogPost, 'blog')}
              >
                Copy
              </Button>
            </div>
          }
          padding="lg"
        >
          <div className={styles.blogPost}>
            <pre className={styles.blogContent}>{blogPost}</pre>
          </div>
        </Card>
      )}
    </div>
  );
}

function SocialTab({ stage, onCopy, copied }) {
  const posts = stage?.output_data?.posts || [];

  return (
    <div className={styles.tabContent}>
      {posts.map((post, i) => (
        <Card
          key={i}
          title={post.platform}
          headerAction={
            <Badge variant="primary">{post.content_type}</Badge>
          }
          padding="lg"
        >
          <p className={styles.socialPost}>{post.content}</p>
          {post.hashtags && (
            <p className={styles.hashtags}>{post.hashtags.join(' ')}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === `social-${i}` ? Check : Copy}
            onClick={() => onCopy(post.content, `social-${i}`)}
          >
            Copy
          </Button>
        </Card>
      ))}
    </div>
  );
}

function EmailTab({ stage, onCopy, copied }) {
  const email = stage?.output_data;

  if (!email) return <EmptyState message="No email content" />;

  return (
    <div className={styles.tabContent}>
      <Card title="Subject Lines" padding="lg">
        <div className={styles.subjectLines}>
          {email.subject_lines?.map((subject, i) => (
            <div key={i} className={styles.subjectItem}>
              <span>{subject}</span>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={copied === `subject-${i}` ? Check : Copy}
                onClick={() => onCopy(subject, `subject-${i}`)}
              >
                Copy
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {email.preview_text && (
        <Card title="Preview Text" padding="lg">
          <p>{email.preview_text}</p>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === 'preview' ? Check : Copy}
            onClick={() => onCopy(email.preview_text, 'preview')}
          >
            Copy
          </Button>
        </Card>
      )}

      {email.body_content && (
        <Card title="Email Body" padding="lg">
          <pre className={styles.emailBody}>{email.body_content}</pre>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === 'body' ? Check : Copy}
            onClick={() => onCopy(email.body_content, 'body')}
          >
            Copy
          </Button>
        </Card>
      )}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className={styles.emptyState}>
      <AlertCircle size={32} />
      <p>{message}</p>
    </div>
  );
}

export default ReviewHub;

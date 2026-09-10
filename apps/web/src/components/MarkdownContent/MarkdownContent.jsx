/**
 * MarkdownContent — Sprint H's XSS boundary for author-written Blog
 * article bodies (spec §11/§42). Renders Markdown, never raw HTML: no
 * `rehype-raw` plugin is loaded, so any literal `<script>`/`<img
 * onerror>`/etc. an author types is escaped to inert text, never parsed
 * as DOM; `rehype-sanitize`'s default schema additionally strips
 * dangerous URL schemes (e.g. `javascript:` in a link or image `src`)
 * from the small subset of real HTML elements `react-markdown` itself
 * generates from Markdown syntax (`<a>`, `<img>`, headings, lists...).
 * This is the ONLY place in the app that renders Blog body content —
 * every other surface (list excerpts, SEO description) uses the plain-
 * text `excerpt` field instead.
 */

import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import styles from './MarkdownContent.module.scss';

export default function MarkdownContent({ children }) {
  return (
    <div className={styles.content}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

MarkdownContent.propTypes = {
  children: PropTypes.string.isRequired,
};

/**
 * AskDesavii — the Hero's AI-assisted way into search: describe a trip in
 * your own words, check what Desavii understood, then see real results.
 * Presentation only; `useAskDesavii` owns the request, the availability
 * and the interpretation, and the caller turns an intent into the
 * canonical Search state.
 *
 * It never pretends: while no real language model answers, the composer
 * is shown disabled with a plain explanation and a way back to Search; a
 * failed request keeps the words and offers Search with them at once;
 * nothing is sent until the traveller asks, and nothing opens until they
 * choose "Show results".
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@desavii/ui/components/primitives';
import ActionLink from '../ActionLink/ActionLink.jsx';
import IntentChips from './IntentChips.jsx';
import { ASK_MAX_LENGTH } from '../../hooks/useAskDesavii.js';
import styles from './AskDesavii.module.scss';

export default function AskDesavii({
  ask,
  loginHref,
  onShowResults,
  onRefine,
  onUseSearch,
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const samples = t('home.ask.samples', { returnObjects: true });
  const isOff = ask.status === 'unavailable' || ask.status === 'checking';

  const handleSubmit = (event) => {
    event.preventDefault();
    ask.ask();
  };

  const hintKey = {
    checking: 'home.ask.hint.ready',
    unavailable: 'home.ask.hint.unavailable',
    signin: 'home.ask.hint.signin',
    ready: 'home.ask.hint.ready',
  }[ask.status];

  return (
    <div className={styles.ask}>
      <form
        className={styles.composer}
        onSubmit={handleSubmit}
        aria-label={t('home.search.modes.ask')}
      >
        <label htmlFor={inputId} className={styles.srOnly}>
          {t('home.ask.inputLabel')}
        </label>
        <textarea
          id={inputId}
          className={styles.input}
          rows={2}
          maxLength={ASK_MAX_LENGTH}
          value={ask.prompt}
          onChange={(event) => ask.setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) handleSubmit(event);
          }}
          placeholder={t('home.ask.placeholder')}
          disabled={isOff}
          aria-describedby={hintId}
        />
        <div className={styles.bar}>
          <p id={hintId} className={styles.hint}>
            <Sparkles size={14} aria-hidden="true" className={styles.mark} />
            {t(hintKey)}
          </p>
          {ask.status === 'ready' && (
            <Button
              type="submit"
              loading={ask.isAsking}
              disabled={!ask.prompt.trim()}
              iconLeft={<Sparkles size={18} />}
            >
              {t('home.ask.submit')}
            </Button>
          )}
          {ask.status === 'signin' && (
            <ActionLink
              href={loginHref}
              variant="primary"
              onClick={ask.keepForSignIn}
            >
              {t('home.ask.signIn')}
            </ActionLink>
          )}
        </div>
      </form>

      <p className={styles.srOnly} aria-live="polite">
        {ask.isAsking ? t('home.ask.reading') : ''}
      </p>

      {ask.status === 'unavailable' && (
        <div className={styles.notice} role="status">
          <p className={styles.noticeTitle}>
            {t('home.ask.unavailable.title')}
          </p>
          <p className={styles.noticeText}>
            {t('home.ask.unavailable.description')}
          </p>
          <Button variant="secondary" onClick={() => onUseSearch('')}>
            {t('home.ask.useSearch')}
          </Button>
        </div>
      )}

      {ask.hasFailed && (
        <div className={styles.notice} role="alert">
          <p className={styles.noticeTitle}>{t('home.ask.error.title')}</p>
          <p className={styles.noticeText}>{t('home.ask.error.description')}</p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => onUseSearch(ask.prompt)}>
              {t('home.ask.searchWords')}
            </Button>
            <Button variant="ghost" onClick={ask.ask}>
              {t('home.ask.retry')}
            </Button>
          </div>
        </div>
      )}

      {!ask.intent && !isOff && (
        <div className={styles.samples}>
          <p className={styles.samplesLabel}>{t('home.ask.samplesLabel')}</p>
          <ul className={styles.sampleList}>
            {samples.map((sample) => (
              <li key={sample}>
                <button
                  type="button"
                  className={styles.sample}
                  onClick={() => ask.setPrompt(sample)}
                >
                  {sample}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ask.intent && (
        <section className={styles.intent} aria-labelledby={`${hintId}-intent`}>
          <p id={`${hintId}-intent`} className={styles.intentTitle}>
            {t('home.ask.understood')}
          </p>
          {ask.parts.length > 0 ? (
            <IntentChips parts={ask.parts} onRemove={ask.removePart} />
          ) : (
            <p className={styles.noticeText}>{t('home.ask.nothingMatched')}</p>
          )}
          <div className={styles.actions}>
            <Button
              onClick={() => onShowResults(ask.intent)}
              iconRight={<ArrowRight size={18} />}
            >
              {t('home.ask.showResults')}
            </Button>
            <Button variant="secondary" onClick={() => onRefine(ask.intent)}>
              {t('home.ask.refine')}
            </Button>
            <Button variant="ghost" onClick={ask.startOver}>
              {t('home.ask.startOver')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

AskDesavii.propTypes = {
  /** `useAskDesavii()`'s return. */
  ask: PropTypes.shape({
    status: PropTypes.oneOf(['checking', 'unavailable', 'signin', 'ready'])
      .isRequired,
    prompt: PropTypes.string.isRequired,
    setPrompt: PropTypes.func.isRequired,
    ask: PropTypes.func.isRequired,
    isAsking: PropTypes.bool.isRequired,
    hasFailed: PropTypes.bool.isRequired,
    intent: PropTypes.shape({}),
    parts: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
    removePart: PropTypes.func.isRequired,
    startOver: PropTypes.func.isRequired,
    keepForSignIn: PropTypes.func.isRequired,
  }).isRequired,
  loginHref: PropTypes.string.isRequired,
  onShowResults: PropTypes.func.isRequired,
  onRefine: PropTypes.func.isRequired,
  /** Back to the structured fields, with the request's words (or none). */
  onUseSearch: PropTypes.func.isRequired,
};

/**
 * AiAssistantDrawer (Stage 15.3) — the contextual assistant's chat panel,
 * built on `Drawer` (COMPONENT_LIBRARY.md), visually echoing Messaging's
 * bubble language. Streams the assistant's reply token-by-token via
 * `aiStreamClient.js`'s fetch-based SSE reader; if streaming itself fails
 * before any chunk arrives (no `fetch`/`ReadableStream` support, or a
 * network error), it falls back to the synchronous `POST /ai/assistant`
 * route via `useAskAssistantMutation` so a reply still arrives rather than
 * a dead end.
 *
 * The global, every-layout trigger (`AiAssistantTrigger`) mounts this with
 * no `contextType`/`contextId` — there is no single "current
 * listing/booking" concept at that level, so it's honestly a general
 * assistant grounded only in its own conversation history. `AskAiButton`
 * (Phase 15 "AI Polish" sprint) mounts a second instance of this exact same
 * drawer — never a duplicate chat UI — with a real `{contextType,
 * contextId}` pair from the page it's placed on, plus an optional
 * `initialMessage` that is auto-sent once when the drawer first opens (a
 * page with no backend-supported context, like the Partner Dashboard,
 * passes only `initialMessage` — an honest prefilled question, not a
 * fabricated context type).
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Drawer } from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import { Input } from '@desavii/ui/components/form-controls';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { streamAssistantMessage } from '../../../../api/aiStreamClient.js';
import { useAskAssistantMutation } from '../../mutations/useAskAssistantMutation.js';
import styles from './AiAssistantDrawer.module.scss';

export default function AiAssistantDrawer({
  isOpen,
  onClose,
  contextType = undefined,
  contextId = undefined,
  initialMessage = undefined,
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const conversationIdRef = useRef(null);
  const hasAutoSentRef = useRef(false);
  const askMutation = useAskAssistantMutation();

  function appendMessage(message) {
    setMessages((current) => [...current, message]);
  }

  function replaceLastAssistantMessage(content) {
    setMessages((current) => {
      const next = [...current];
      next[next.length - 1] = { role: 'assistant', content };
      return next;
    });
  }

  async function streamReply(trimmed) {
    let assembled = '';
    let receivedAnyChunk = false;
    // eslint-disable-next-line no-restricted-syntax -- ordered SSE chunks
    for await (const chunk of streamAssistantMessage({
      message: trimmed,
      contextType: conversationIdRef.current ? undefined : contextType,
      contextId: conversationIdRef.current ? undefined : contextId,
      conversationId: conversationIdRef.current ?? undefined,
    })) {
      receivedAnyChunk = true;
      if (chunk.delta) {
        assembled += chunk.delta;
        replaceLastAssistantMessage(assembled);
      }
      if (chunk.done && chunk.conversationId) {
        conversationIdRef.current = chunk.conversationId;
      }
    }
    return receivedAnyChunk;
  }

  async function fallbackReply(trimmed) {
    const response = await askMutation.mutateAsync({
      message: trimmed,
      contextType: conversationIdRef.current ? undefined : contextType,
      contextId: conversationIdRef.current ? undefined : contextId,
      conversationId: conversationIdRef.current ?? undefined,
    });
    conversationIdRef.current = response.data.conversation_id;
    replaceLastAssistantMessage(response.data.message);
  }

  async function submitMessage(trimmed) {
    if (!trimmed || isSending) return;
    setError(null);
    appendMessage({ role: 'user', content: trimmed });
    appendMessage({ role: 'assistant', content: '' });
    setIsSending(true);

    try {
      const receivedAnyChunk = await streamReply(trimmed);
      if (!receivedAnyChunk) {
        await fallbackReply(trimmed);
      }
    } catch {
      try {
        await fallbackReply(trimmed);
      } catch (fallbackError) {
        setError(fallbackError?.message ?? t('ai.assistant.error'));
        setMessages((current) => current.slice(0, -1));
      }
    } finally {
      setIsSending(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput('');
    await submitMessage(trimmed);
  }

  useEffect(() => {
    if (
      isOpen &&
      initialMessage &&
      !hasAutoSentRef.current &&
      messages.length === 0
    ) {
      hasAutoSentRef.current = true;
      submitMessage(initialMessage.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-send is a one-time trigger keyed by isOpen/initialMessage only
  }, [isOpen, initialMessage]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={t('ai.assistant.title')}
      closeLabel={t('common.close')}
    >
      <Stack gap="4">
        <div className={styles.messages} role="log" aria-live="polite">
          {messages.length === 0 && (
            <p className={styles.empty}>{t('ai.assistant.empty')}</p>
          )}
          {messages.map((message, index) => (
            <div
              // eslint-disable-next-line react/no-array-index-key -- messages are append-only, never reordered or removed mid-list
              key={index}
              className={
                message.role === 'user'
                  ? styles.userBubble
                  : styles.assistantBubble
              }
            >
              {message.content}
            </div>
          ))}
        </div>
        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}
        <form onSubmit={handleSubmit} aria-label={t('ai.assistant.title')}>
          <Inline gap="2" align="flex-end">
            <Input
              aria-label={t('ai.assistant.inputLabel')}
              placeholder={t('ai.assistant.placeholder')}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <Button type="submit" disabled={isSending || !input.trim()}>
              {isSending ? t('ai.assistant.sending') : t('ai.assistant.send')}
            </Button>
          </Inline>
        </form>
      </Stack>
    </Drawer>
  );
}

AiAssistantDrawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  contextType: PropTypes.oneOf(['listing', 'booking']),
  contextId: PropTypes.number,
  initialMessage: PropTypes.string,
};

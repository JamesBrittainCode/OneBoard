'use client';

import { useMemo } from 'react';
import type { ResponseCard as ResponseCardType } from '@/lib/types';

function cardColor(seed: number) {
  const hues = [18, 34, 52, 78, 110, 145, 178, 205, 230, 258, 286, 320];
  const hue = hues[seed % hues.length];
  return `hsl(${hue} 75% 92%)`;
}

export default function ResponseCard({
  card,
  anonymousMode,
  highlighted,
  onToggleHighlight,
  draggable = false,
  onDragStart
}: {
  card: ResponseCardType;
  anonymousMode: boolean;
  highlighted: boolean;
  onToggleHighlight: () => void;
  draggable?: boolean;
  onDragStart?: (responseId: number) => void;
}) {
  const background = useMemo(() => cardColor(card.id), [card.id]);

  return (
    <article
      className={`response-card ${highlighted ? 'highlighted' : ''}`}
      style={{ backgroundColor: background }}
      onClick={onToggleHighlight}
      draggable={draggable}
      onDragStart={() => onDragStart?.(card.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleHighlight();
        }
      }}
    >
      <header>
        <span>{anonymousMode ? 'Anonymous response' : `Response #${card.id}`}</span>
      </header>
      <p>{card.content}</p>
    </article>
  );
}
